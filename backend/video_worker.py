import os
from celery import Celery

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "video_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    worker_concurrency=1,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_queue_max_priority=9,
    task_default_priority=5,
)

PRIORITY_MAP = {"high": 9, "normal": 5, "low": 1}


@celery_app.task(name="video_worker.process_video_job", bind=True, max_retries=2)
def process_video_job(self, job_payload: dict):
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ.get("DB_NAME", "automonk")
    db_client = AsyncIOMotorClient(mongo_url)
    db = db_client[db_name]

    async def _run():
        from video_service import create_video_post
        return await create_video_post(db=db, **job_payload)

    try:
        result = asyncio.run(_run())
        return result
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
    finally:
        db_client.close()


def enqueue_video_job(job_payload: dict) -> str:
    """Submit job to Celery queue with priority. Returns task ID."""
    priority_str = job_payload.get("priority", "normal")
    priority = PRIORITY_MAP.get(priority_str, 5)
    task = process_video_job.apply_async(
        args=[job_payload],
        priority=priority,
    )
    return task.id
