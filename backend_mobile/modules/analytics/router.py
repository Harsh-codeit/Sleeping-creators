"""Analytics — cached snapshots from Bundle social accounts."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.database import get_db
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.modules.iam.router import _current_user_id
from backend_mobile.modules.publishing import bundle_service
from backend_mobile.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _latest_item(raw: dict) -> dict:
    """Bundle returns a time series under `items` (newest first). Pick the most
    recent snapshot, guarding against unordered data by sorting on createdAt."""
    items = raw.get("items") or []
    if not items:
        return {}
    try:
        return sorted(items, key=lambda x: x.get("createdAt") or "", reverse=True)[0]
    except Exception:
        return items[0]


def _extract_kpis(raw: dict) -> dict:
    """Map Bundle's `/analytics/social-account` response to the flat, snake_case
    KPI dict the frontend expects. Real Bundle fields are camelCase and live in
    the latest `items[]` entry — not at the top level."""
    latest = _latest_item(raw)

    impressions = int(latest.get("impressions") or 0)
    likes       = int(latest.get("likes") or 0)
    comments    = int(latest.get("comments") or 0)
    followers   = int(latest.get("followers") or 0)

    # Bundle doesn't send an engagement rate — derive it: interactions / reach.
    denom = impressions or followers or 0
    engagement_rate = round(((likes + comments) / denom) * 100, 2) if denom else 0.0

    return {
        "followers":          followers,
        "following":          int(latest.get("following") or 0),
        "impressions":        impressions,
        "impressions_unique": int(latest.get("impressionsUnique") or 0),
        "views":              int(latest.get("views") or 0),
        "views_unique":       int(latest.get("viewsUnique") or 0),
        "likes":              likes,
        "comments":           comments,
        "post_count":         int(latest.get("postCount") or 0),
        "engagement_rate":    engagement_rate,
    }


def _account_meta(raw: dict) -> dict:
    """Account profile details from Bundle's analytics response."""
    acct = raw.get("socialAccount") or {}
    return {
        "username":     acct.get("username") or acct.get("userUsername") or "",
        "display_name": acct.get("displayName") or acct.get("userDisplayName") or "",
        "avatar_url":   acct.get("avatarUrl"),
        "bio":          acct.get("bio") or "",
        "external_id":  acct.get("externalId"),
    }


def _history(raw: dict, limit: int = 30) -> list[dict]:
    """Recent daily snapshots (oldest→newest) for trend charts."""
    items = raw.get("items") or []
    try:
        items = sorted(items, key=lambda x: x.get("createdAt") or "")
    except Exception:
        pass
    return [
        {
            "date":               it.get("createdAt"),
            "followers":          int(it.get("followers") or 0),
            "impressions":        int(it.get("impressions") or 0),
            "impressions_unique": int(it.get("impressionsUnique") or 0),
            "views":              int(it.get("views") or 0),
            "likes":              int(it.get("likes") or 0),
            "comments":           int(it.get("comments") or 0),
            "post_count":         int(it.get("postCount") or 0),
        }
        for it in items[-limit:]
    ]


_POST_METRIC_LABELS = {
    "likes": "Likes", "comments": "Comments", "impressions": "Impressions",
    "impressionsUnique": "Reach", "reach": "Reach", "views": "Views",
    "viewsUnique": "Unique Views", "saved": "Saves", "saves": "Saves",
    "shares": "Shares", "reposts": "Reposts", "engagement": "Engagement",
    "profileVisits": "Profile Visits", "profileActivity": "Profile Activity",
    "totalInteractions": "Interactions", "followsFromPost": "Follows",
}
_POST_METRIC_SKIP = {"id", "socialAccountId", "postId", "createdAt", "updatedAt", "deletedAt", "forced"}


def _extract_post_metrics(raw: dict) -> dict:
    """All numeric metrics from a post's latest analytics snapshot. Pass-through of
    every numeric field so saves/shares/etc. surface automatically when Bundle sends
    them (Instagram fields vary and can't be hardcoded blindly)."""
    items = raw.get("items") or []
    if not items:
        return {}
    try:
        latest = sorted(items, key=lambda x: x.get("createdAt") or "", reverse=True)[0]
    except Exception:
        latest = items[0]
    return {
        k: int(v)
        for k, v in latest.items()
        if k not in _POST_METRIC_SKIP and isinstance(v, (int, float)) and not isinstance(v, bool)
    }


async def _fetch_posts_analytics(team_id: str, platform: str, limit: int = 12) -> list[dict]:
    """List the account's recent posts and pull each one's analytics from Bundle."""
    try:
        bundle_posts = await bundle_service.list_posts(settings.bundle_api_key, team_id, limit=limit)
    except Exception as exc:
        logger.warning("Bundle list_posts failed for %s: %s", team_id, exc)
        return []

    async def _one(bp: dict) -> dict | None:
        bp_id = bp.get("id")
        if not bp_id:
            return None
        try:
            pa = await bundle_service.get_post_analytics(settings.bundle_api_key, team_id, platform, bp_id)
        except Exception as exc:
            logger.warning("Post analytics failed for %s: %s", bp_id, exc)
            return None
        post_obj = pa.get("post") or {}
        profile = pa.get("profilePost") or {}
        ext = (post_obj.get("externalData") or {}).get(bundle_service.PLATFORM_MAP.get(platform, "").upper(), {})
        return {
            "post_id":      bp_id,
            "title":        post_obj.get("title") or profile.get("title") or profile.get("description") or "",
            "thumbnail":    profile.get("thumbnail") or profile.get("smallThumbnail"),
            "permalink":    profile.get("permalink") or ext.get("permalink"),
            "published_at": profile.get("publishedAt") or post_obj.get("postedDate"),
            "status":       post_obj.get("status"),
            "metrics":      _extract_post_metrics(pa),
            "metric_labels": _POST_METRIC_LABELS,
        }

    import asyncio
    results = await asyncio.gather(*[_one(bp) for bp in bundle_posts], return_exceptions=True)
    out = [r for r in results if isinstance(r, dict) and r]
    # newest first
    out.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    return out


def _build_response(snapshot: dict) -> dict:
    """Shape a DB snapshot into what ClientAnalyticsPanel expects."""
    return snapshot


@router.get("/clients/{client_id}")
async def get_analytics(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return cached analytics snapshot. Empty if never refreshed."""
    doc = await db.analytics.find_one({"client_id": client_id}, {"_id": 0})
    if not doc:
        # Check if Instagram is connected at all
        try:
            user = await iam_service.get_user_by_id(db, client_id)
            team_id = user.get("bundle_team_id")
            if not team_id:
                return {"bundle_connected": False, "totals": {}, "bundle": {"socials": []}, "platform_breakdown": {}}
            accounts = await bundle_service.get_connected_accounts(settings.bundle_api_key, team_id)
            connected = len(accounts.get("connected", [])) > 0
        except Exception:
            connected = False
        return {
            "bundle_connected": connected,
            "totals": {},
            "bundle": {"socials": [], "socials_refreshed_at": None},
            "platform_breakdown": {},
        }
    return _build_response(doc)


@router.post("/clients/{client_id}/refresh")
async def refresh_analytics(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Pull live data from Bundle, store snapshot, return it."""
    try:
        user = await iam_service.get_user_by_id(db, client_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="User not found")

    team_id = user.get("bundle_team_id")
    if not team_id:
        raise HTTPException(status_code=400, detail="Instagram not connected")

    # Fetch connected accounts
    try:
        accounts_info = await bundle_service.get_connected_accounts(settings.bundle_api_key, team_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Bundle error: {exc}") from exc

    connected_platforms = accounts_info.get("connected", [])
    raw_accounts = accounts_info.get("accounts", [])

    platform_breakdown: dict[str, dict] = {}
    socials: list[dict] = []

    for platform in connected_platforms:
        acct_meta = next(
            (a for a in raw_accounts if a.get("type", "").upper() == bundle_service.PLATFORM_MAP.get(platform, "").upper()),
            {}
        )
        meta: dict = {}
        history: list = []
        try:
            raw = await bundle_service.get_social_account_analytics(settings.bundle_api_key, team_id, platform)
            kpis = _extract_kpis(raw)
            meta = _account_meta(raw)
            history = _history(raw)
        except Exception as exc:
            logger.warning("Analytics fetch failed for %s/%s: %s", team_id, platform, exc)
            kpis = {}

        platform_breakdown[platform] = kpis
        socials.append({
            "platform":     platform,
            "username":     meta.get("username") or acct_meta.get("username", ""),
            "display_name": meta.get("display_name", ""),
            "avatar_url":   meta.get("avatar_url"),
            "bio":          meta.get("bio", ""),
            "refreshed_at": _now(),
            "history":      history,
            **kpis,
        })

    # Aggregate totals across all platforms
    totals: dict[str, float] = {}
    if platform_breakdown:
        for kpis in platform_breakdown.values():
            for k, v in kpis.items():
                totals[k] = totals.get(k, 0) + (v or 0)
        # engagement_rate is an average, not a sum
        n = len(platform_breakdown)
        if n > 1 and "engagement_rate" in totals:
            totals["engagement_rate"] = totals["engagement_rate"] / n

    # Per-post analytics for each post published on the account (Instagram).
    posts_analytics: list[dict] = []
    if "instagram" in connected_platforms:
        posts_analytics = await _fetch_posts_analytics(team_id, "instagram")

    snapshot = {
        "client_id":       client_id,
        "bundle_connected": True,
        "totals":          totals,
        "bundle": {
            "socials":              socials,
            "socials_refreshed_at": _now(),
        },
        "platform_breakdown": platform_breakdown,
        "posts":           posts_analytics,
        "updated_at":      _now(),
    }

    await db.analytics.update_one(
        {"client_id": client_id},
        {"$set": snapshot},
        upsert=True,
    )

    return snapshot
