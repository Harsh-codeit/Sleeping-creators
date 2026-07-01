from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy import JSON as _JsonType
_VECTOR_COL = lambda: Column(_JsonType, nullable=True)  # JSON until PG17+ with pgvector
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(timezone.utc)

def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class HookLibrary(Base):
    __tablename__ = "hook_library"
    __table_args__ = {"schema": "intelligence"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    hook_text: Mapped[str] = mapped_column(Text, nullable=False)
    hook_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, default="manual")
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="instagram")
    niche: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    embedding = _VECTOR_COL()
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_engagement: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ContentDNA(Base):
    __tablename__ = "content_dna"
    __table_args__ = (
        UniqueConstraint("creator_id", "post_id", name="uq_content_dna_creator_post"),
        {"schema": "intelligence"},
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    post_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    hook_type: Mapped[str] = mapped_column(String(64), nullable=False)
    opening_structure: Mapped[str] = mapped_column(String(64), nullable=False)
    emotion: Mapped[str] = mapped_column(String(64), nullable=False)
    format: Mapped[str] = mapped_column(String(64), nullable=False)
    hook_text_preview: Mapped[str] = mapped_column(String(256), nullable=False)
    embedding = _VECTOR_COL()
    jaccard_shingle: Mapped[Optional[list]] = mapped_column(ARRAY(Text), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class TrendsCache(Base):
    __tablename__ = "trends_cache"
    __table_args__ = (
        UniqueConstraint("niche", name="uq_trends_cache_niche"),
        {"schema": "intelligence"},
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    niche: Mapped[str] = mapped_column(String(128), nullable=False)
    keywords: Mapped[list] = mapped_column(ARRAY(Text), nullable=False, default=list)
    trending_topics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    refreshed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GenerationLog(Base):
    __tablename__ = "generation_log"
    __table_args__ = {"schema": "intelligence"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    model_used: Mapped[str] = mapped_column(String(128), nullable=False)
    tokens_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gate_result: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class ContentPlan(Base):
    __tablename__ = "content_plans"
    __table_args__ = {"schema": "intelligence"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    creator_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    week_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    plan_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
