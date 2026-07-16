"""Ingestion job tracker — writes progress to db.ingestion_jobs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_job(db, source: str, source_url: str, total_count: int = 0) -> str:
    job_id = str(uuid.uuid4())
    await db.ingestion_jobs.insert_one({
        "id": job_id,
        "source": source,
        "source_url": source_url,
        "status": "pending",
        "total_count": total_count,
        "processed_count": 0,
        "failed_count": 0,
        "started_at": _now(),
        "finished_at": None,
    })
    return job_id


async def update_job(
    db,
    job_id: str,
    *,
    status: Literal["pending", "running", "done", "failed"] | None = None,
    total_count: int | None = None,
    processed_count: int | None = None,
    failed_count: int | None = None,
    finished: bool = False,
    error: str | None = None,
) -> None:
    patch: dict = {}
    if status is not None:
        patch["status"] = status
    if total_count is not None:
        patch["total_count"] = total_count
    if processed_count is not None:
        patch["processed_count"] = processed_count
    if failed_count is not None:
        patch["failed_count"] = failed_count
    if finished:
        patch["finished_at"] = _now()
    if error is not None:
        patch["error"] = error
    if patch:
        await db.ingestion_jobs.update_one({"id": job_id}, {"$set": patch})


async def list_jobs(db, limit: int = 10) -> list[dict]:
    docs = (
        await db.ingestion_jobs
        .find({}, {"_id": 0})
        .sort("started_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    return docs
