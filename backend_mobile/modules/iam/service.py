"""IAM service — OTP auth + JWT issuance (Motor/MongoDB)."""
from __future__ import annotations

import logging
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.shared.exceptions import NotFoundError, UnauthorizedError

logger = logging.getLogger(__name__)

_OTP_TTL_SECONDS = 600  # 10 minutes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _normalize_identifier(identifier: str) -> str:
    identifier = identifier.strip()
    if "@" in identifier:
        return identifier.lower()
    # Phone: ensure +91 prefix
    if not identifier.startswith("+"):
        identifier = "+91" + identifier.lstrip("0")
    return identifier


def _make_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": "user",
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_expiry_days),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except Exception as exc:
        raise UnauthorizedError("Invalid or expired access token") from exc


# ── OTP ───────────────────────────────────────────────────────────────────────

async def send_otp(db: AsyncIOMotorDatabase, identifier: str, purpose: str) -> dict:
    identifier = _normalize_identifier(identifier)

    is_email = "@" in identifier
    field = "email" if is_email else "phone"

    if purpose == "login":
        user = await db.users.find_one({field: identifier})
        if not user:
            raise NotFoundError("No account found with this phone/email. Please sign up first.")

    if purpose == "register":
        existing = await db.users.find_one({field: identifier})
        if existing:
            raise NotFoundError("Account already exists. Please sign in instead.")

    code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_OTP_TTL_SECONDS)

    # Remove any previous OTPs for this identifier + purpose
    await db.otps.delete_many({"identifier": identifier, "purpose": purpose})

    await db.otps.insert_one({
        "identifier": identifier,
        "otp": code,
        "purpose": purpose,
        "expires_at": expires_at,
        "debug": True,
    })

    logger.info("OTP [%s] for %s (purpose=%s)", code, identifier[:4] + "***", purpose)
    return {
        "message": "OTP sent",
        "debug_otp": code,
        "expires_in_seconds": _OTP_TTL_SECONDS,
    }


async def verify_otp(
    db: AsyncIOMotorDatabase,
    identifier: str,
    code: str,
    purpose: str,
    full_name: Optional[str] = None,
) -> dict:
    identifier = _normalize_identifier(identifier)
    now = datetime.now(timezone.utc)

    record = await db.otps.find_one({
        "identifier": identifier,
        "purpose": purpose,
        "expires_at": {"$gt": now},
    })

    if not record:
        raise UnauthorizedError("OTP not found or expired. Request a new one.")

    if str(record["otp"]) != str(code):
        raise UnauthorizedError("Invalid OTP")

    await db.otps.delete_one({"_id": record["_id"]})

    # Find or create user
    is_email = "@" in identifier
    lookup_field = "email" if is_email else "phone"
    user = await db.users.find_one({lookup_field: identifier})

    if not user:
        if purpose == "login":
            raise NotFoundError("No account found. Please sign up first.")
        # New signup — create user document
        name = full_name or (identifier.split("@")[0] if is_email else identifier)
        user_doc = {
            "name": name,
            "email": identifier if is_email else None,
            "phone": None if is_email else identifier,
            "interests": [],
            "niche": "",
            "onboarding_complete": False,
            "created_at": now.isoformat(),
        }
        result = await db.users.insert_one(user_doc)
        user = await db.users.find_one({"_id": result.inserted_id})

    user_id = str(user["_id"])
    token = _make_jwt(user_id)

    return {
        "token": token,
        "access_token": token,
        "token_type": "bearer",
        "user": _serialize_user(user),
    }


# ── User ──────────────────────────────────────────────────────────────────────

def _serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]) if "_id" in user else user.get("id", ""),
        "name": user.get("name", ""),
        "full_name": user.get("name", ""),  # alias for frontend compatibility
        "email": user.get("email"),
        "phone": user.get("phone"),
        "niche": user.get("niche", ""),
        "interests": user.get("interests", []),
        "onboarding_complete": user.get("onboarding_complete", False),
        "role": user.get("role", "user"),
        "created_at": user.get("created_at"),
    }


async def get_user_by_id(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        user = None
    if not user:
        raise NotFoundError("User not found")
    return _serialize_user(user)


async def update_user(db: AsyncIOMotorDatabase, user_id: str, updates: dict) -> dict:
    try:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
        return await get_user_by_id(db, user_id)
    except NotFoundError:
        raise
    except Exception as exc:
        raise NotFoundError("User not found") from exc
