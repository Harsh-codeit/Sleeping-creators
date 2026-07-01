"""Pydantic schemas for IAM module."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────

class SendOtpRequest(BaseModel):
    identifier: str = Field(..., description="Phone (+91XXXXXXXXXX) or email address")
    purpose: str = Field(default="login", pattern="^(login|signup|register)$")


class SendOtpResponse(BaseModel):
    message: str
    identifier: str
    expires_in_seconds: int
    debug_otp: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    identifier: str
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    purpose: str = Field(default="login", pattern="^(login|signup|register)$")
    full_name: Optional[str] = None
    device_id: Optional[str] = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token: str  # alias — old frontend reads this field
    token_type: str = "bearer"
    user: "UserProfile"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ── User ──────────────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    id: str
    name: Optional[str] = None
    full_name: Optional[str] = None  # alias for compatibility
    email: Optional[str] = None
    phone: Optional[str] = None
    niche: Optional[str] = None
    interests: list = []
    onboarding_complete: bool = False
    role: str = "user"
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    niche: Optional[str] = None
    interests: Optional[list] = None
