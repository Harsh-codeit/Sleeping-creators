"""IAM service — OTP auth + JWT issuance (Motor/MongoDB)."""
from __future__ import annotations

import logging
import random
import re
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from bson import ObjectId
from jose import jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.shared.exceptions import NotFoundError, UnauthorizedError, ValidationError

logger = logging.getLogger(__name__)

_OTP_TTL_SECONDS = 600  # 10 minutes


async def _send_email_otp(to: str, otp: str) -> None:
    """Send OTP via Resend. Raises on delivery failure."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.resend_from_email,
                "to": [to],
                "subject": f"Your Sleeping Creators code: {otp}",
                "html": (
                    f"<p>Hi there,</p>"
                    f"<p>Your one-time login code is: <strong style='font-size:24px;letter-spacing:4px'>{otp}</strong></p>"
                    f"<p>It expires in 10 minutes. Do not share this code.</p>"
                    f"<p>— Sleeping Creators</p>"
                ),
            },
        )
        if resp.status_code >= 400:
            # Surface Resend's actual reason (e.g. unverified domain, test-mode
            # restriction, rate limit) so it shows up in the Render logs.
            raise RuntimeError(
                f"Resend {resp.status_code}: {resp.text[:300]} "
                f"(from={settings.resend_from_email!r}, to={to!r})"
            )


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

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def send_otp(db: AsyncIOMotorDatabase, identifier: str, purpose: str) -> dict:
    identifier = _normalize_identifier(identifier)

    is_email = "@" in identifier
    field = "email" if is_email else "phone"

    # Reject malformed emails before we ever call Resend — otherwise Resend
    # returns a 422 "Invalid `to` field" that surfaces as a generic failure.
    if is_email and not _EMAIL_RE.match(identifier):
        raise ValidationError("Please enter a valid email address.")

    if purpose == "login":
        user = await db.users.find_one({field: identifier})
        if not user:
            raise NotFoundError("user", detail="No account found. Please sign up first.")

    if purpose == "register":
        existing = await db.users.find_one({field: identifier})
        if existing:
            raise NotFoundError("user", detail="Account already exists. Please sign in instead.")

    code = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_OTP_TTL_SECONDS)

    # Remove any previous OTPs for this identifier + purpose
    await db.otps.delete_many({"identifier": identifier, "purpose": purpose})

    await db.otps.insert_one({
        "identifier": identifier,
        "otp": code,
        "purpose": purpose,
        "expires_at": expires_at,
    })

    # Send email via Resend when an API key is configured
    if is_email and settings.resend_api_key:
        try:
            await _send_email_otp(identifier, code)
            logger.info("OTP email sent to %s (purpose=%s)", identifier[:4] + "***", purpose)
        except Exception as exc:
            logger.error("Resend delivery failed for %s: %s", identifier[:4] + "***", exc)
            raise RuntimeError("Could not send OTP email. Please try again.") from exc
    else:
        logger.info("OTP [%s] for %s (purpose=%s) — no email provider configured", code, identifier[:4] + "***", purpose)

    response: dict = {"message": "OTP sent", "expires_in_seconds": _OTP_TTL_SECONDS}
    if settings.debug:
        response["debug_otp"] = code
    return response


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
        "competitors": user.get("competitors", []),
        "brand_voice": user.get("brand_voice", ""),
        "target_audience": user.get("target_audience", ""),
        "spice_level": user.get("spice_level", 3),
        "onboarding_complete": user.get("onboarding_complete", False),
        "role": user.get("role", "user"),
        "avatar_url": user.get("avatar_url", ""),
        "created_at": user.get("created_at"),
        "bio": user.get("bio", ""),
        # ── Extended onboarding questionnaire (Section 1: Basic Info) ──
        "profile_name": user.get("profile_name", ""),
        "whatsapp_number": user.get("whatsapp_number", ""),
        "city_country": user.get("city_country", ""),
        "instagram_username": user.get("instagram_username", ""),
        "instagram_profile_url": user.get("instagram_profile_url", ""),
        "website_url": user.get("website_url", ""),
        "linkedin_url": user.get("linkedin_url", ""),
        "youtube_url": user.get("youtube_url", ""),
        "twitter_url": user.get("twitter_url", ""),
        # ── Section 2: Story, Brand & Audience ──
        "business_description": user.get("business_description", ""),
        "niche_statement": user.get("niche_statement", ""),
        "audience_age_min": user.get("audience_age_min"),
        "audience_age_max": user.get("audience_age_max"),
        "audience_emotional_states": user.get("audience_emotional_states", []),
        "has_case_studies": user.get("has_case_studies", False),
        "topics_love": user.get("topics_love", []),
        "solutions_provided": user.get("solutions_provided", []),
        "unique_selling_points": user.get("unique_selling_points", []),
        "faqs": user.get("faqs", []),
        # ── Section 3: Content Strategy ──
        "content_language": user.get("content_language", ""),
        "content_dislikes": user.get("content_dislikes", []),
        "topics_to_avoid": user.get("topics_to_avoid", []),
        "underserved_topics": user.get("underserved_topics", []),
        # ── Section 4: Goals & CTA ──
        "primary_goal": user.get("primary_goal", ""),
        "content_cta": user.get("content_cta", ""),
        "landing_page_url": user.get("landing_page_url", ""),
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
