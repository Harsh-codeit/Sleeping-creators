from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now() -> datetime: return datetime.now(timezone.utc)
def _uuid() -> str: return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = {"schema": "studio"}

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="carousel")  # carousel | video
    format: Mapped[str] = mapped_column(String(16), nullable=False, default="4:5")
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="personal")  # global | personal
    color_scheme: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    font_style: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    layout_style: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    niche: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canvas: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)   # zones, elements, bg
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_starter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")  # draft | published
    slide_count: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
