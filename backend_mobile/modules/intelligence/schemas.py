"""Pydantic request / response schemas for the Intelligence module."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ── Request schemas ────────────────────────────────────────────────────────────

class CarouselGenerationRequest(BaseModel):
    creator_id: Optional[str] = None
    topic: str = Field(..., min_length=3, max_length=512)
    tone: str = ""
    slide_count: int = Field(default=7, ge=3, le=15)
    platform: str = Field(default="instagram")
    cta_keyword: Optional[str] = None
    cta_offer: Optional[str] = None
    preferred_hook_type: Optional[str] = None
    force_regenerate: bool = False
    reference_content: Optional[str] = None           # creator-provided example (reel analysis or free text)
    trending_reference_content: Optional[str] = None  # analyzed trending post/reel in creator's niche
    template_blueprint: Optional[list] = None          # per-slide role/guidance from the chosen template


class TextPostGenerationRequest(BaseModel):
    creator_id: Optional[str] = None
    topic: str = Field(..., min_length=3, max_length=512)
    platform: str = Field(default="instagram")
    post_type: Literal["caption", "thread", "linkedin_post"] = "caption"


class ContentPlanRequest(BaseModel):
    creator_id: str
    week_start: datetime
    topics: list[str] = Field(default_factory=list)
    override_frequency: Optional[int] = None


# ── Slide / content data ────────────────────────────────────────────────────────

class SlideData(BaseModel):
    slide_number: int
    heading: str
    body: str
    visual_cue: Optional[str] = None


class GeneratedCarousel(BaseModel):
    format: str
    hook_type: str
    opening_structure: str
    slides: list[SlideData]
    caption: str
    hashtags: list[str]
    cta_text: Optional[str] = None
    raw_json: dict[str, Any] = Field(default_factory=dict)


class GeneratedTextPost(BaseModel):
    platform: str
    content: str
    hashtags: list[str]
    raw_json: dict[str, Any] = Field(default_factory=dict)


# ── Response schemas ───────────────────────────────────────────────────────────

class CarouselGenerationResponse(BaseModel):
    generation_id: str
    creator_id: str
    topic: str
    content: GeneratedCarousel
    gate_score: float
    retry_count: int
    model_used: str
    latency_ms: int
    created_at: datetime


class TextPostGenerationResponse(BaseModel):
    generation_id: str
    creator_id: str
    topic: str
    content: GeneratedTextPost
    model_used: str
    latency_ms: int
    created_at: datetime


class ContentPlanDay(BaseModel):
    date: str
    day_of_week: str
    topic: str
    format: Literal["carousel", "video", "text"]
    hook_type: str
    emotion: str
    brief: str


class ContentPlanResponse(BaseModel):
    plan_id: str
    creator_id: str
    week_start: datetime
    days: list[ContentPlanDay]
    status: str
    created_at: datetime


# ── Hook library schemas ────────────────────────────────────────────────────────

class HookIngestRequest(BaseModel):
    hooks: list[HookItem]
    source: str = "manual"
    creator_id: Optional[str] = None


class HookItem(BaseModel):
    hook_text: str
    hook_type: str
    platform: str = "instagram"
    niche: Optional[str] = None
    avg_engagement: float = 0.0


class HookResponse(BaseModel):
    id: str
    hook_text: str
    hook_type: str
    niche: Optional[str]
    avg_engagement: float
    usage_count: int


# ── Generation log ──────────────────────────────────────────────────────────────

class GenerationLogEntry(BaseModel):
    id: str
    creator_id: str
    format: str
    model_used: str
    tokens_used: int
    latency_ms: int
    gate_result: str
    retry_count: int
    error: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
