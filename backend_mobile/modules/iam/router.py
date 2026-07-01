"""IAM router — auth + user profile endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.database import get_db
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.modules.iam.schemas import (
    SendOtpRequest,
    SendOtpResponse,
    UpdateProfileRequest,
    VerifyOtpRequest,
)
from backend_mobile.shared.exceptions import NotFoundError, UnauthorizedError

router = APIRouter(prefix="/api/v1", tags=["auth"])


# ── Shared dependency ─────────────────────────────────────────────────────────

def _current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = iam_service.decode_access_token(token)
        return payload["sub"]
    except UnauthorizedError as exc:
        raise HTTPException(status_code=401, detail=exc.detail) from exc


# ── Auth ─────────────────────────────────────────────────────────────────────

@router.post("/auth/send-otp", response_model=SendOtpResponse)
async def send_otp(
    req: SendOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        result = await iam_service.send_otp(db, req.identifier, req.purpose)
        return SendOtpResponse(
            message=result["message"],
            identifier=req.identifier,
            expires_in_seconds=result["expires_in_seconds"],
            debug_otp=result.get("debug_otp"),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/auth/verify-otp", status_code=status.HTTP_200_OK)
async def verify_otp(
    req: VerifyOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        return await iam_service.verify_otp(
            db=db,
            identifier=req.identifier,
            code=req.code,
            purpose=req.purpose,
            full_name=req.full_name,
        )
    except (UnauthorizedError, NotFoundError) as exc:
        raise HTTPException(status_code=401, detail=exc.detail) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/users/me")
async def get_me(
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        return await iam_service.get_user_by_id(db, user_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc


@router.patch("/users/me")
async def update_me(
    req: UpdateProfileRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    updates = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.full_name is not None:
        updates["name"] = req.full_name
    if req.email is not None:
        updates["email"] = req.email
    if req.niche is not None:
        updates["niche"] = req.niche
    if req.interests is not None:
        updates["interests"] = req.interests

    try:
        return await iam_service.update_user(db, user_id, updates)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=exc.detail) from exc
