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


def _extract_kpis(raw: dict) -> dict:
    """Map Bundle's analytics response to a flat KPI dict."""
    # Bundle may nest data under different keys depending on version
    acct = raw.get("socialAccount") or raw.get("account") or {}
    stats = raw.get("analytics") or raw.get("stats") or raw.get("data") or raw

    return {
        "followers":          acct.get("followers")         or stats.get("followers")         or 0,
        "following":          acct.get("following")         or stats.get("following")         or 0,
        "impressions":        stats.get("impressions")      or stats.get("reach")             or 0,
        "impressions_unique": stats.get("impressions_unique") or stats.get("unique_reach")    or 0,
        "views":              stats.get("views")            or stats.get("video_views")       or 0,
        "views_unique":       stats.get("views_unique")     or stats.get("unique_views")      or 0,
        "likes":              stats.get("likes")            or stats.get("like_count")        or 0,
        "comments":           stats.get("comments")         or stats.get("comment_count")     or 0,
        "post_count":         acct.get("post_count")        or stats.get("post_count")        or 0,
        "engagement_rate":    stats.get("engagement_rate")  or stats.get("engagementRate")    or 0.0,
    }


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
        try:
            raw = await bundle_service.get_social_account_analytics(settings.bundle_api_key, team_id, platform)
            kpis = _extract_kpis(raw)
        except Exception as exc:
            logger.warning("Analytics fetch failed for %s/%s: %s", team_id, platform, exc)
            kpis = {}

        platform_breakdown[platform] = kpis
        socials.append({
            "platform":     platform,
            "username":     acct_meta.get("username", ""),
            "avatar_url":   None,
            "refreshed_at": _now(),
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

    snapshot = {
        "client_id":       client_id,
        "bundle_connected": True,
        "totals":          totals,
        "bundle": {
            "socials":              socials,
            "socials_refreshed_at": _now(),
        },
        "platform_breakdown": platform_breakdown,
        "updated_at":      _now(),
    }

    await db.analytics.update_one(
        {"client_id": client_id},
        {"$set": snapshot},
        upsert=True,
    )

    return snapshot
