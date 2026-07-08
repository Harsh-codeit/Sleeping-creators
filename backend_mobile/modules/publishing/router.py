"""Bundle.social connect + account management routes."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.database import get_db
from backend_mobile.modules.iam.router import _current_user_id
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.modules.publishing import bundle_service

router = APIRouter(prefix="/api/bundle", tags=["publishing"])


@router.post("/setup/{creator_id}")
async def setup_bundle(
    creator_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a Bundle.social team for the creator and store team_id on user doc."""
    try:
        user = await iam_service.get_user_by_id(db, creator_id)
    except Exception:
        raise HTTPException(404, "User not found")

    if user.get("bundle_team_id"):
        return {"ok": True, "team_id": user["bundle_team_id"], "already_exists": True}

    try:
        name = user.get("name") or creator_id
        team = await bundle_service.create_team(
            api_key=settings.bundle_api_key,
            name=f"SC-{name[:30]}",
        )
        team_id = team.get("id") or team.get("teamId") or team.get("_id", "")
    except Exception as exc:
        raise HTTPException(502, f"Bundle setup failed: {exc}")

    await iam_service.update_user(db, creator_id, {"bundle_team_id": team_id})
    return {"ok": True, "team_id": team_id}


@router.get("/connect/{creator_id}")
async def connect_instagram(
    creator_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return a Bundle.social portal URL to connect Instagram via OAuth."""
    try:
        user = await iam_service.get_user_by_id(db, creator_id)
    except Exception:
        raise HTTPException(404, "User not found")

    team_id = user.get("bundle_team_id")
    if not team_id:
        name = user.get("name") or creator_id
        try:
            team = await bundle_service.create_team(
                api_key=settings.bundle_api_key,
                name=f"SC-{name[:30]}",
            )
            team_id = team.get("id") or team.get("teamId") or team.get("_id", "")
            await iam_service.update_user(db, creator_id, {"bundle_team_id": team_id})
        except Exception as exc:
            raise HTTPException(502, f"Team creation failed: {exc}")

    # If Instagram is already connected, return the refresh status instead of
    # creating a new portal link (avoids hitting the Bundle social-set limit).
    try:
        status = await bundle_service.get_connected_accounts(settings.bundle_api_key, team_id)
        if "instagram" in status.get("connected", []):
            ig = next((a for a in status.get("accounts", []) if a.get("type") == "INSTAGRAM"), {})
            return {
                "already_connected": True,
                "team_id": team_id,
                "instagram_username": ig.get("username"),
            }
    except Exception:
        pass  # proceed to portal link if status check fails

    try:
        url = await bundle_service.create_portal_link(
            api_key=settings.bundle_api_key,
            team_id=team_id,
            platforms=["instagram"],
            redirect_url=f"{settings.app_base_url}/settings",
        )
    except httpx.HTTPStatusError as exc:
        body = ""
        try:
            body = exc.response.json()
        except Exception:
            body = exc.response.text[:300]
        body_str = str(body).lower()
        if exc.response.status_code == 403 and ("social set limit" in body_str or "limit" in body_str):
            raise HTTPException(
                503,
                "Instagram connection slots are currently full on our platform. "
                "Please contact support to connect your account.",
            )
        raise HTTPException(502, f"Portal link failed: {exc}")
    except Exception as exc:
        raise HTTPException(502, f"Portal link failed: {exc}")

    return {"url": url, "team_id": team_id}


@router.get("/refresh/{creator_id}")
async def refresh_accounts(
    creator_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Refresh and return connected social accounts for this creator."""
    try:
        user = await iam_service.get_user_by_id(db, creator_id)
    except Exception:
        raise HTTPException(404, "User not found")

    team_id = user.get("bundle_team_id")
    if not team_id:
        return {"connected": [], "accounts": [], "instagram": False}

    try:
        result = await bundle_service.get_connected_accounts(settings.bundle_api_key, team_id)
    except Exception as exc:
        raise HTTPException(502, f"Bundle refresh failed: {exc}")

    ig_account = next((a for a in result.get("accounts", []) if a.get("type") == "INSTAGRAM"), {})
    return {
        "connected": result.get("connected", []),
        "accounts": result.get("accounts", []),
        "instagram": bool(ig_account),
        "instagram_username": ig_account.get("username"),
        "team_id": team_id,
    }
