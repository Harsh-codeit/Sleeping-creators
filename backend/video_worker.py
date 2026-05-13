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

                    # Always persist the render artifacts first
                    await db.posts.update_one(
                        {"id": post["id"]},
                        {"$set": {
                            "status": "succeeded",
                            "r2_video_url": r2_video,
                            "r2_snapshot_url": r2_snap,
                            "error_message": None,
                        }},
                    )

                    # Auto-publish path — pipeline was run manually with publish=True
                    if post.get("auto_publish_after_render"):
                        try:
                            from publisher import publish as _publish
                            fresh_post = await db.posts.find_one({"id": post["id"]})
                            pub_result = await _publish(fresh_post, client, publish_now=True)
                            pub_status = pub_result.get("status", "failed")
                            pub_update = {
                                "status": pub_status,
                                "error_message": pub_result.get("error"),
                                "published_at": datetime.now(timezone.utc).isoformat() if pub_status == "published" else None,
                                "platform_post_id": pub_result.get("platform_post_id"),
                            }
                            await db.posts.update_one({"id": post["id"]}, {"$set": pub_update})
                            logger.info(f"auto-publish post_id={post['id']} → {pub_status}")
                        except Exception as _pe:
                            logger.exception(f"auto-publish failed for post {post['id']}")
                            await db.posts.update_one(
                                {"id": post["id"]},
                                {"$set": {"status": "failed", "error_message": f"Publish error: {_pe}"}},
                            )
                    elif client.get("auto_approve"):
                        # Existing flow: auto-approve clients go through Bundle scheduling
                        await handoff_to_bundle(db, post, r2_video, r2_snap)
                    # else: stays at "succeeded" awaiting manual publish (default)

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


async def _run_video_job_async(post_id: str) -> dict:
    """Same work the Celery task does, but callable from inside the FastAPI
    event loop. Used as a fallback when Celery isn't reachable so renders still
    happen in dev / single-process deployments."""
    import asyncio as _aio
    from datetime import datetime, timezone

    db_client, db = _db()
    try:
        post = await db.posts.find_one({"id": post_id})
        if not post:
            return {"skipped": True}
        # If another worker already claimed it (e.g. Celery picked it up first),
        # don't double-render. Check status is still 'rendering' AND there's no
        # render_job_id yet.
        if post.get("render_job_id"):
            return {"skipped": "already_claimed"}

        pipeline = None
        if post.get("pipeline_id"):
            pipeline = await db.pipelines.find_one({"id": post["pipeline_id"]})

        from video_render_service import submit_render_for_post, mirror_to_r2, handoff_to_bundle
        import shotstack_service
        render_job = await submit_render_for_post(
            db=db, post=post,
            clip_drive_ids=post.get("clip_drive_ids") or [],
            music_url=post.get("music_url"),
            pipeline=pipeline,
        )
        shotstack_render_id = render_job.get("shotstack_render_id")
        if not shotstack_render_id:
            return {"status": "no_render_id"}

        for _ in range(72):  # ~6 minutes
            await _aio.sleep(5)
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
                fresh = await db.posts.find_one({"id": post_id})
                client = await db.clients.find_one({"id": fresh["client_id"]}) or {}
                await db.posts.update_one(
                    {"id": post_id},
                    {"$set": {
                        "status": "succeeded",
                        "r2_video_url": r2_video,
                        "r2_snapshot_url": r2_snap,
                        "error_message": None,
                    }},
                )

                if fresh.get("auto_publish_after_render"):
                    try:
                        from publisher import publish as _publish
                        latest = await db.posts.find_one({"id": post_id})
                        pub_result = await _publish(latest, client, publish_now=True)
                        pub_status = pub_result.get("status", "failed")
                        await db.posts.update_one(
                            {"id": post_id},
                            {"$set": {
                                "status": pub_status,
                                "error_message": pub_result.get("error"),
                                "published_at": datetime.now(timezone.utc).isoformat() if pub_status == "published" else None,
                                "platform_post_id": pub_result.get("platform_post_id"),
                            }},
                        )
                    except Exception as _pe:
                        logger.exception(f"auto-publish failed for post {post_id}")
                        await db.posts.update_one(
                            {"id": post_id},
                            {"$set": {"status": "failed", "error_message": f"Publish error: {_pe}"}},
                        )
                elif client.get("auto_approve"):
                    await handoff_to_bundle(db, fresh, r2_video, r2_snap)

                return {"status": "succeeded"}

            elif status == "failed":
                error = resp.get("error") or "render failed"
                await db.render_jobs.update_one(
                    {"id": render_job["id"]},
                    {"$set": {"status": "failed", "completed_at": now, "error": error}},
                )
                await db.posts.update_one(
                    {"id": post_id},
                    {"$set": {"status": "failed_render", "error_message": error}},
                )
                return {"status": "failed"}

        # Timed out
        await db.posts.update_one(
            {"id": post_id},
            {"$set": {"status": "failed_render", "error_message": "Render timed out after 6 minutes"}},
        )
        return {"status": "timeout"}
    finally:
        db_client.close()


def enqueue_video_job(post_id: str, priority: str = "normal") -> str:
    """Enqueue a render. Tries Celery first; if unreachable, runs the job
    inline via asyncio so dev/single-process deployments still render."""
    import asyncio as _aio
    p = PRIORITY_MAP.get(priority, 5)
    try:
        task = process_video_job.apply_async(args=[{"post_id": post_id}], priority=p)
        # Also spin up an asyncio safety net — if Celery doesn't claim the post
        # within ~10s, run the job in-process. Whichever wins, the render_job_id
        # check in _run_video_job_async prevents double execution.
        try:
            loop = _aio.get_event_loop()
            if loop.is_running():
                _aio.create_task(_safety_net_fallback(post_id, delay=10))
        except RuntimeError:
            pass  # No event loop available (called from sync context)
        return task.id
    except Exception as e:
        # Celery / Redis unreachable — fall back to in-process render
        logger.warning(f"Celery enqueue failed ({e}); running render in-process")
        try:
            loop = _aio.get_event_loop()
            if loop.is_running():
                _aio.create_task(_run_video_job_async(post_id))
                return f"inproc-{post_id[:8]}"
        except RuntimeError:
            pass
        raise


async def _safety_net_fallback(post_id: str, delay: int = 10) -> None:
    """Wait `delay` seconds; if no Celery worker has claimed the post by then
    (render_job_id still unset), run the render in-process. Prevents stuck
    'rendering' status when Celery worker isn't running."""
    import asyncio as _aio
    await _aio.sleep(delay)
    db_client, db = _db()
    try:
        post = await db.posts.find_one({"id": post_id}, {"render_job_id": 1, "status": 1})
        if not post:
            return
        # If render_job_id was set, a worker (Celery or another in-proc task) claimed it
        if post.get("render_job_id"):
            return
        # If status moved past 'rendering', nothing to do
        if post.get("status") not in ("rendering", None):
            return
        logger.info(f"Safety net: no worker claimed post {post_id} in {delay}s — running in-process")
    finally:
        db_client.close()
    await _run_video_job_async(post_id)


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


@celery_app.task(name="video_worker.poll_template_previews")
def poll_template_previews():
    """Poll pending template preview renders and save thumbnail_url when done."""
    import asyncio

    db_client, db = _db()
    try:
        from shotstack_template_importer import poll_preview_renders
        return asyncio.run(poll_preview_renders(db))
    finally:
        db_client.close()


celery_app.conf.beat_schedule = {
    "shotstack-watchdog": {
        "task": "video_worker.watchdog_stuck_renders",
        "schedule": 60.0,
    },
    "poll-template-previews": {
        "task": "video_worker.poll_template_previews",
        "schedule": 30.0,
    },
}
