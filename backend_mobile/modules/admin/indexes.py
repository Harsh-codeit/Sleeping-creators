"""MongoDB index definitions — called once at app startup.

All indexes use background=True so they don't block the event loop
if they need to be built on a large collection.
"""
from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING, IndexModel

logger = logging.getLogger(__name__)


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create all application indexes idempotently.

    Motor / MongoDB only creates an index if an identical one doesn't already
    exist, so this is safe to call on every startup.
    """
    try:
        await _ensure(db)
        logger.info("MongoDB indexes ensured")
    except Exception as exc:
        logger.warning("Index creation failed (non-fatal): %s", exc)


async def _ensure(db: AsyncIOMotorDatabase) -> None:
    # ── generation_log ────────────────────────────────────────────────────────
    # Most admin queries filter/sort on creator_id + created_at
    await db.generation_log.create_indexes([
        IndexModel([("creator_id", ASCENDING), ("created_at", DESCENDING)], background=True),
        IndexModel([("created_at", DESCENDING)], background=True),
        IndexModel([("gate_result", ASCENDING)], background=True),
        IndexModel([("model_used", ASCENDING)], background=True),
    ])

    # ── content_dna ──────────────────────────────────────────────────────────
    # Used heavily in admin stats (win counts, publish counts) and AI context
    await db.content_dna.create_indexes([
        IndexModel([("creator_id", ASCENDING), ("created_at", DESCENDING)], background=True),
        IndexModel([("creator_id", ASCENDING), ("is_winner", ASCENDING)], background=True),
        IndexModel([("creator_id", ASCENDING), ("published", ASCENDING)], background=True),
        IndexModel([("hook_type", ASCENDING), ("is_winner", ASCENDING)], background=True),
        IndexModel([("generation_id", ASCENDING)], background=True, sparse=True),
    ])

    # ── posts ─────────────────────────────────────────────────────────────────
    await db.posts.create_indexes([
        IndexModel([("creator_id", ASCENDING), ("created_at", DESCENDING)], background=True),
        IndexModel([("creator_id", ASCENDING), ("status", ASCENDING)], background=True),
        IndexModel([("scheduled_at", ASCENDING)], background=True, sparse=True),
        IndexModel([("id", ASCENDING)], background=True, unique=True),
    ])

    # ── carousels ─────────────────────────────────────────────────────────────
    await db.carousels.create_indexes([
        IndexModel([("creator_id", ASCENDING), ("created_at", DESCENDING)], background=True),
        IndexModel([("id", ASCENDING)], background=True, unique=True),
        IndexModel([("generation_id", ASCENDING)], background=True, sparse=True),
    ])

    # ── users ─────────────────────────────────────────────────────────────────
    # _id already has a unique index; add secondary lookup fields
    await db.users.create_indexes([
        IndexModel([("email", ASCENDING)], background=True, sparse=True),
        IndexModel([("phone", ASCENDING)], background=True, sparse=True),
        IndexModel([("niche", ASCENDING)], background=True),
        IndexModel([("created_at", DESCENDING)], background=True),
    ])

    # ── hook_library ──────────────────────────────────────────────────────────
    await db.hook_library.create_indexes([
        IndexModel([("hook_type", ASCENDING), ("is_active", ASCENDING)], background=True),
        IndexModel([("niche", ASCENDING), ("is_active", ASCENDING)], background=True),
        IndexModel([("usage_count", DESCENDING)], background=True),
        IndexModel([("id", ASCENDING)], background=True, unique=True),
    ])

    # ── performance_library ───────────────────────────────────────────────────
    await db.performance_library.create_indexes([
        IndexModel([("niches", ASCENDING), ("hook_type", ASCENDING), ("engagement_score", DESCENDING)], background=True),
        IndexModel([("niches", ASCENDING), ("format", ASCENDING), ("engagement_score", DESCENDING)], background=True),
        IndexModel([("source", ASCENDING)], background=True),
        IndexModel([("processed_at", DESCENDING)], background=True),
        IndexModel([("engagement_score", DESCENDING)], background=True),
    ])

    # ── ingestion_jobs ────────────────────────────────────────────────────────
    await db.ingestion_jobs.create_indexes([
        IndexModel([("started_at", DESCENDING)], background=True),
        IndexModel([("status", ASCENDING)], background=True),
    ])

    # ── analytics ─────────────────────────────────────────────────────────────
    await db.analytics.create_indexes([
        IndexModel([("client_id", ASCENDING)], background=True, unique=True),
    ])

    # ── otps — TTL + lookup ───────────────────────────────────────────────────
    await db.otps.create_indexes([
        IndexModel([("identifier", ASCENDING), ("purpose", ASCENDING)], background=True),
        # TTL: auto-expire OTP docs after 15 minutes
        IndexModel([("created_at", ASCENDING)], expireAfterSeconds=900, background=True),
    ])
