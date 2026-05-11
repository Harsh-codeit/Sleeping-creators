import os
import logging
from celery import Celery

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "video_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

_concurrency = int(os.environ.get("VIDEO_WORKER_CONCURRENCY", "8"))

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    worker_concurrency=_concurrency,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_queue_max_priority=9,
    task_default_priority=5,
)

PRIORITY_MAP = {"high": 9, "normal": 5, "low": 1}


def _db():
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "sleeping-creators")
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


@celery_app.task(
    name="video_worker.process_video_job",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=5,
)
def process_video_job(self, job_payload: dict):
    """Submit a render to Shotstack and poll until complete.

    job_payload: {"post_id": str}
    """
    import asyncio
    from datetime import datetime, timezone

    db_client, db = _db()
    try:
        async def _run():
            post = await db.posts.find_one({"id": job_payload["post_id"]})
            if not post:
                logger.warning(f"Post {job_payload['post_id']} not found; skipping")
                return {"skipped": True}

            pipeline = None
            if post.get("pipeline_id"):
                pipeline = await db.pipelines.find_one({"id": post["pipeline_id"]})

            from video_render_service import submit_render_for_post, mirror_to_r2, handoff_to_bundle
            render_job = await submit_render_for_post(
                db=db,
                post=post,
                clip_drive_ids=post.get("clip_drive_ids") or [],
                music_url=post.get("music_url"),
                pipeline=pipeline,
            )

            shotstack_render_id = render_job.get("shotstack_render_id")
            if not shotstack_render_id:
                return render_job

            import shotstack_service
            # Poll every 5s for up to 6 minutes (72 attempts)
            for _ in range(72):
                await asyncio.sleep(5)
                try:
                    resp = await shotstack_service.poll_render(shotstack_render_id)
                except Exception as e:
                    logger.warning(f"poll_render failed: {e}")
                    continue

                status = resp.get("status")
                now = datetime.now(timezone.utc).isoformat()

                if status == "done":
                    r2_video, r2_snap = await mirror_to_r2(
                        resp.get("url"), resp.get("snapshot_url"),
                        render_job["client_id"], shotstack_render_id,
                    )
                    await db.render_jobs.update_one(
                        {"id": render_job["id"]},
                        {"$set": {
                            "status": "succeeded", "completed_at": now,
                            "output_url": resp.get("url"),
                            "r2_video_url": r2_video, "r2_snapshot_url": r2_snap,
                        }},
                    )
                    post = await db.posts.find_one({"id": job_payload["post_id"]})
                    client = await db.clients.find_one({"id": post["client_id"]}) or {}
                    if client.get("auto_approve"):
                        await handoff_to_bundle(db, post, r2_video, r2_snap)
                    else:
                        await db.posts.update_one(
                            {"id": post["id"]},
                            {"$set": {
                                "status": "succeeded",
                                "r2_video_url": r2_video,
                                "r2_snapshot_url": r2_snap,
                            }},
                        )
                    logger.info(f"render succeeded post_id={post['id']}")
                    return {"status": "succeeded", "r2_video_url": r2_video}

                elif status == "failed":
                    error = resp.get("error") or "render failed"
                    await db.render_jobs.update_one(
                        {"id": render_job["id"]},
                        {"$set": {"status": "failed", "completed_at": now, "error": error}},
                    )
                    await db.posts.update_one(
                        {"id": job_payload["post_id"]},
                        {"$set": {"status": "failed_render", "error_message": error}},
                    )
                    logger.error(f"render failed post_id={job_payload['post_id']}")
                    return {"status": "failed"}

            # Timed out — watchdog will clean up
            logger.warning(f"process_video_job: timed out polling {shotstack_render_id}")
            return {"status": "timeout"}

        return asyncio.run(_run())
    finally:
        db_client.close()


def enqueue_video_job(post_id: str, priority: str = "normal") -> str:
    p = PRIORITY_MAP.get(priority, 5)
    task = process_video_job.apply_async(args=[{"post_id": post_id}], priority=p)
    return task.id


@celery_app.task(name="video_worker.watchdog_stuck_renders")
def watchdog_stuck_renders():
    """Poll Shotstack for renders stuck in 'submitted' >5min. Mark failed if >30min."""
    import asyncio
    from datetime import datetime, timezone, timedelta

    db_client, db = _db()
    try:
        async def _run():
            import shotstack_service
            cutoff_5 = datetime.now(timezone.utc) - timedelta(minutes=5)
            cutoff_30 = datetime.now(timezone.utc) - timedelta(minutes=30)
            cursor = db.render_jobs.find({"status": "submitted"})
            checked = 0
            async for rj in cursor:
                try:
                    submitted_at = datetime.fromisoformat(rj["submitted_at"].replace("Z", "+00:00"))
                except Exception:
                    continue
                if submitted_at > cutoff_5:
                    continue
                if submitted_at < cutoff_30:
                    await db.render_jobs.update_one(
                        {"id": rj["id"], "status": "submitted"},
                        {"$set": {"status": "failed", "error": "watchdog: stuck >30min",
                                  "completed_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    if rj.get("post_id"):
                        await db.posts.update_one(
                            {"id": rj["post_id"]},
                            {"$set": {"status": "failed_render", "error_message": "stuck >30min"}},
                        )
                    continue
                # 5-30 min: poll Shotstack
                ss_id = rj.get("shotstack_render_id")
                if not ss_id:
                    continue
                try:
                    resp = await shotstack_service.poll_render(ss_id)
                    if resp.get("status") == "done":
                        from video_render_service import mirror_to_r2
                        r2_video, r2_snap = await mirror_to_r2(
                            resp.get("url"), None, rj["client_id"], ss_id,
                        )
                        await db.render_jobs.update_one(
                            {"id": rj["id"], "status": "submitted"},
                            {"$set": {
                                "status": "succeeded",
                                "completed_at": datetime.now(timezone.utc).isoformat(),
                                "output_url": resp.get("url"),
                                "r2_video_url": r2_video, "r2_snapshot_url": r2_snap,
                            }},
                        )
                    elif resp.get("status") == "failed":
                        await db.render_jobs.update_one(
                            {"id": rj["id"], "status": "submitted"},
                            {"$set": {"status": "failed", "error": resp.get("error", "unknown"),
                                      "completed_at": datetime.now(timezone.utc).isoformat()}},
                        )
                except Exception as e:
                    logger.warning(f"watchdog poll failed for {rj.get('id')}: {e}")
                checked += 1
            return {"checked": checked}

        return asyncio.run(_run())
    finally:
        db_client.close()


celery_app.conf.beat_schedule = {
    "shotstack-watchdog": {
        "task": "video_worker.watchdog_stuck_renders",
        "schedule": 60.0,
    },
}
