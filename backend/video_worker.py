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

_concurrency = int(os.environ.get("CREATOMATE_WORKER_CONCURRENCY", "8"))

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
    """Submit a render to Creatomate for an existing post.

    job_payload: {"post_id": str}
    The post must already exist with status='rendering'.
    """
    import asyncio
    import creatomate_service

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

            from video_render_service import submit_render_for_post
            return await submit_render_for_post(
                db=db,
                post=post,
                clip_drive_ids=post.get("clip_drive_ids") or [],
                music_url=post.get("music_url"),
                pipeline=pipeline,
            )

        try:
            return asyncio.run(_run())
        except creatomate_service.CreatomateRateLimited as e:
            raise self.retry(exc=e, countdown=e.retry_after)
        except Exception as exc:
            raise
    finally:
        db_client.close()


def enqueue_video_job(post_id: str, priority: str = "normal") -> str:
    p = PRIORITY_MAP.get(priority, 5)
    task = process_video_job.apply_async(args=[{"post_id": post_id}], priority=p)
    return task.id
