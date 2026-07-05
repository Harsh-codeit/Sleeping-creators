"""Trend intelligence tool — fetches trending topics for a creator's niche.

Cache layers (fastest to slowest):
  1. Redis hot cache (6-hour TTL)
  2. MongoDB trends_cache collection (24-hour stale threshold)
  3. RapidAPI Instagram hashtag search (Instagram-native trending tags)
  4. pytrends live fetch (Google Trends fallback — may fail)

Never raises — returns [] on total failure.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

_REDIS_TTL   = 6 * 3600  # 6 hours
_MONGO_STALE = 24         # hours before MongoDB cache is considered stale


async def get_trending_topics(
    niche: str,
    db,    # AsyncIOMotorDatabase
    redis,
    limit: int = 10,
) -> list[str]:
    """Return trending topics for a niche. Never raises — returns [] on failure."""
    redis_key = f"trends:{niche.lower().replace(' ', '_')}"

    # 1. Redis hot cache
    if redis:
        try:
            raw = await redis.get(redis_key)
            if raw:
                data = json.loads(raw)
                logger.debug("Trend cache hit (Redis) niche=%s", niche)
                return data.get("topics", [])[:limit]
        except Exception as exc:
            logger.warning("Redis trend lookup failed: %s", exc)

    # 2. MongoDB warm cache
    try:
        stale_cutoff = (datetime.now(timezone.utc) - timedelta(hours=_MONGO_STALE)).isoformat()
        doc = await db.trends_cache.find_one(
            {"niche": niche, "refreshed_at": {"$gte": stale_cutoff}},
            {"_id": 0, "topics": 1},
        )
        if doc:
            topics = doc.get("topics", [])[:limit]
            logger.debug("Trend cache hit (MongoDB) niche=%s", niche)
            await _cache_in_redis(redis, redis_key, topics)
            return topics
    except Exception as exc:
        logger.warning("MongoDB trend lookup failed: %s", exc)

    # 3. RapidAPI Instagram hashtag search (Instagram-native trending tags)
    topics = await _fetch_from_rapidapi(niche, limit)

    # 4. pytrends fallback if RapidAPI returns nothing
    if not topics:
        topics = await _fetch_from_pytrends(niche, limit)

    if topics:
        await _persist(niche, topics, db, redis, redis_key)

    return topics


async def _fetch_from_rapidapi(niche: str, limit: int) -> list[str]:
    """Fetch Instagram-native trending hashtags via RapidAPI."""
    from backend_mobile.config import settings
    if not settings.rapidapi_instagram_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://instagram-data1.p.rapidapi.com/hashtag/feed",
                headers={
                    "X-RapidAPI-Key": settings.rapidapi_instagram_key,
                    "X-RapidAPI-Host": "instagram-data1.p.rapidapi.com",
                },
                params={"hashtag": niche.lower().replace(" ", ""), "batch_size": "12"},
            )
            resp.raise_for_status()
            data = resp.json()
        # Extract hashtag names from the response items
        tags: list[str] = []
        for item in (data.get("collector") or data.get("data") or [])[:limit]:
            caption = item.get("description") or item.get("caption") or ""
            # Pull hashtags from the caption text
            import re
            found = re.findall(r"#(\w+)", caption)
            tags.extend(found[:3])
            if len(tags) >= limit:
                break
        topics = list(dict.fromkeys(tags))[:limit]  # dedupe preserving order
        if topics:
            logger.info("RapidAPI trending for niche=%s: %d topics", niche, len(topics))
        return topics
    except Exception as exc:
        logger.warning("RapidAPI Instagram fetch failed niche=%s: %s", niche, exc)
        return []


async def _fetch_from_pytrends(niche: str, limit: int) -> list[str]:
    try:
        from pytrends.request import TrendReq
        import asyncio

        def _sync_fetch() -> list[str]:
            pt = TrendReq(hl="en-IN", tz=330)
            pt.build_payload([niche], cat=0, timeframe="now 7-d", geo="IN")
            related = pt.related_queries()
            rows = related.get(niche, {}).get("top")
            if rows is None or rows.empty:
                return []
            return rows["query"].tolist()[:limit]

        return await asyncio.get_running_loop().run_in_executor(None, _sync_fetch)
    except Exception as exc:
        logger.warning("pytrends fetch failed niche=%s: %s", niche, exc)
        return []


async def _cache_in_redis(redis, key: str, topics: list[str]) -> None:
    if not redis:
        return
    try:
        await redis.setex(key, _REDIS_TTL, json.dumps({"topics": topics}))
    except Exception as exc:
        logger.warning("Redis trend write failed: %s", exc)


async def _persist(niche: str, topics: list[str], db, redis, redis_key: str) -> None:
    try:
        now = datetime.now(timezone.utc).isoformat()
        await db.trends_cache.update_one(
            {"niche": niche},
            {"$set": {"niche": niche, "topics": topics, "refreshed_at": now}},
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Trend MongoDB persist failed: %s", exc)
    await _cache_in_redis(redis, redis_key, topics)
