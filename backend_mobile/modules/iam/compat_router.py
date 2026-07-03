"""Compat shim — old API paths the existing React frontend calls."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.database import get_db
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.modules.iam.router import _current_user_id
from backend_mobile.shared.exceptions import NotFoundError, UnauthorizedError

router = APIRouter(prefix="/api", tags=["compat"])


# ── OTP / Auth ────────────────────────────────────────────────────────────────

@router.post("/auth/otp/send")
async def compat_send_otp(body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    identifier = body.get("identifier", "")
    purpose = body.get("purpose", "login")
    try:
        return await iam_service.send_otp(db, identifier, purpose)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/auth/otp/verify")
async def compat_verify_otp(body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    identifier = body.get("identifier", "")
    code = str(body.get("otp") or body.get("code", ""))
    purpose = body.get("purpose", "login")
    full_name = body.get("full_name") or body.get("name")
    try:
        return await iam_service.verify_otp(db=db, identifier=identifier, code=code,
                                             purpose=purpose, full_name=full_name)
    except (UnauthorizedError, NotFoundError) as exc:
        raise HTTPException(status_code=401, detail=exc.detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/auth/register")
async def compat_register(body: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Final signup step — save name + interests, return JWT."""
    identifier = body.get("identifier", "")
    name = body.get("name", "").strip()
    interests = body.get("interests", [])
    other = body.get("other_interest", "").strip()
    if other:
        interests = list(interests) + [other]

    normalized = iam_service._normalize_identifier(identifier)
    is_email = "@" in normalized
    field = "email" if is_email else "phone"

    user = await db.users.find_one({field: normalized})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Complete OTP verification first.")

    from bson import ObjectId
    updates = {"onboarding_complete": False}
    if name:
        updates["name"] = name
    if interests:
        updates["interests"] = interests
        updates["niche"] = interests[0] if interests else ""

    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    user_id = str(user["_id"])
    token = iam_service._make_jwt(user_id)
    updated = await iam_service.get_user_by_id(db, user_id)
    return {"token": token, "access_token": token, "token_type": "bearer", "user": updated}


@router.put("/auth/profile")
async def compat_update_profile(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    updates = {}
    for field in ("name", "bio", "brand_voice", "target_audience"):
        if field in body:
            updates[field] = body[field]
    if "interests" in body:
        updates["interests"] = body["interests"]
        if body["interests"]:
            updates["niche"] = body["interests"][0]
    if "spice_level" in body:
        updates["spice_level"] = int(body["spice_level"])
    return await iam_service.update_user(db, user_id, updates)


@router.post("/auth/onboarding-complete")
async def compat_onboarding_complete(
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await iam_service.update_user(db, user_id, {"onboarding_complete": True})
    return {"ok": True}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def compat_me(
    authorization: str = Header(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = iam_service.decode_access_token(token)
        return await iam_service.get_user_by_id(db, payload["sub"])
    except UnauthorizedError as exc:
        raise HTTPException(status_code=401, detail=exc.detail) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc


# ── Instagram status (Bundle.social proxy) ────────────────────────────────────

@router.get("/instagram/status/{client_id}")
async def compat_instagram_status(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return Instagram connection status for a creator via Bundle.social."""
    from backend_mobile.config import settings
    try:
        user = await iam_service.get_user_by_id(db, client_id)
        team_id = user.get("bundle_team_id")
        if not team_id:
            return {"connected": False, "status": "not_connected", "username": None}

        from backend_mobile.modules.publishing import bundle_service
        result = await bundle_service.get_connected_accounts(settings.bundle_api_key, team_id)
        ig_connected = "instagram" in result.get("connected", [])
        ig_account = next((a for a in result.get("accounts", []) if a.get("type") == "INSTAGRAM"), {})
        return {
            "connected": ig_connected,
            "status": "connected" if ig_connected else "not_connected",
            "username": ig_account.get("username"),
            "bundle_team_id": team_id,
        }
    except Exception:
        return {"connected": False, "status": "not_connected", "username": None}
