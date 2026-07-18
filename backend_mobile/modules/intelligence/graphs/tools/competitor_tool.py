"""Competitor intelligence tool — fetches recent posts from competitor Instagram accounts.

Uses Apify's instagram-scraper actor to pull the last 10 posts per competitor handle.
Results are cached in MongoDB `competitor_cache` with a 24-hour TTL per handle.

Never raises — returns [] on total failure so the generation pipeline continues.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from backend_mobile.config import settings

logger = logging.getLogger(__name__)

_CACHE_HOURS = 24
# Apify API paths use a tilde (username~actor); a slash 404s.
_APIFY_ACTOR = "apify~instagram-scraper"
_MAX_POSTS_PER_HANDLE = 10


async def get_competitor_posts(
    handles: list[str],
    db,
    limit_per_handle: int = _MAX_POSTS_PER_HANDLE,
) -> list[dict]:
    """Return recent post summaries for competitor handles.

    Each result: {"handle": str, "caption": str, "likes": int, "comments": int}
    Never raises — returns [] on total failure.
    """
    if not handles or not settings.apify_api_key:
        return []

    results: list[dict] = []
    for handle in handles[:5]:  # cap at 5 competitors to keep latency reasonable
        posts = await _get_handle_posts(handle.lstrip("@"), db, limit_per_handle)
        results.extend(posts)

    return results


async def _get_handle_posts(handle: str, db, limit: int) -> list[dict]:
    """Fetch posts for one handle, using MongoDB cache."""
    cached = await _load_cache(handle, db)
    if cached is not None:
        return cached[:limit]

    posts = await _fetch_from_apify(handle, limit)
    if posts:
        await _save_cache(handle, posts, db)

    return posts


async def _load_cache(handle: str, db) -> list[dict] | None:
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=_CACHE_HOURS)).isoformat()
        doc = await db.competitor_cache.find_one(
            {"handle": handle, "refreshed_at": {"$gte": cutoff}},
            {"_id": 0, "posts": 1},
        )
        if doc:
            logger.debug("Competitor cache hit for @%s", handle)
            return doc.get("posts", [])
    except Exception as exc:
        logger.warning("Competitor cache load failed for @%s: %s", handle, exc)
    return None


async def _save_cache(handle: str, posts: list[dict], db) -> None:
    try:
        now = datetime.now(timezone.utc).isoformat()
        await db.competitor_cache.update_one(
            {"handle": handle},
            {"$set": {"handle": handle, "posts": posts, "refreshed_at": now}},
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Competitor cache save failed for @%s: %s", handle, exc)


async def _fetch_from_apify(handle: str, limit: int) -> list[dict]:
    """Call Apify Instagram scraper actor synchronously via the run-sync endpoint."""
    try:
        url = f"https://api.apify.com/v2/acts/{_APIFY_ACTOR}/run-sync-get-dataset-items"
        payload = {
            "directUrls": [f"https://www.instagram.com/{handle}/"],
            "resultsType": "posts",
            "resultsLimit": limit,
            "addParentData": False,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                params={"token": settings.apify_api_key},
                json=payload,
            )
            resp.raise_for_status()
            items = resp.json()

        posts = []
        for item in items[:limit]:
            caption = (item.get("caption") or item.get("text") or "").strip()
            if not caption:
                continue
            posts.append({
                "handle": handle,
                "caption": caption[:500],
                "likes": item.get("likesCount", 0),
                "comments": item.get("commentsCount", 0),
            })

        logger.info("Apify fetched %d posts for @%s", len(posts), handle)
        return posts

    except Exception as exc:
        logger.warning("Apify fetch failed for @%s: %s", handle, exc)
        return []
