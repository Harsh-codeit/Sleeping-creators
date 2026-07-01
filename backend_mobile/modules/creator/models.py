from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(timezone.utc)

def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class CreatorProfile(Base):
    __tablename__ = "creator_profiles"
    __table_args__ = {"schema": "creator"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    niche: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    brand_voice: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_audience: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    languages: Mapped[list] = mapped_column(ARRAY(String(16)), nullable=False, default=lambda: ["en"])
    spice_level: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    preferred_hook_styles: Mapped[list] = mapped_column(ARRAY(String(64)), nullable=False, default=list)
    cta_keywords: Mapped[list] = mapped_column(ARRAY(String(128)), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class CreatorStrategy(Base):
    __tablename__ = "creator_strategy"
    __table_args__ = {"schema": "creator"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    content_pillars: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    posting_frequency: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    topic_includes: Mapped[list] = mapped_column(ARRAY(Text), nullable=False, default=list)
    topic_excludes: Mapped[list] = mapped_column(ARRAY(Text), nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class SocialAccount(Base):
    __tablename__ = "social_accounts"
    __table_args__ = {"schema": "creator"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    handle: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    access_token_enc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    bundle_account_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OnboardingState(Base):
    __tablename__ = "onboarding_state"
    __table_args__ = {"schema": "creator"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    current_step: Mapped[str] = mapped_column(String(64), nullable=False, default="profile")
    completed_steps: Mapped[list] = mapped_column(ARRAY(String(64)), nullable=False, default=list)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
