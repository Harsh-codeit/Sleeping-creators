from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CreatorProfileResponse(BaseModel):
    id: str
    user_id: str
    name: Optional[str]
    niche: Optional[str]
    industry: Optional[str]
    brand_voice: Optional[str]
    target_audience: Optional[str]
    languages: list[str]
    spice_level: int
    preferred_hook_styles: list[str]
    cta_keywords: list[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class UpdateCreatorProfileRequest(BaseModel):
    name: Optional[str] = None
    niche: Optional[str] = None
    industry: Optional[str] = None
    brand_voice: Optional[str] = None
    target_audience: Optional[str] = None
    languages: Optional[list[str]] = None
    spice_level: Optional[int] = None
    preferred_hook_styles: Optional[list[str]] = None
    cta_keywords: Optional[list[str]] = None


class CreatorStrategyResponse(BaseModel):
    creator_id: str
    content_pillars: list[str]
    posting_frequency: int
    topic_includes: list[str]
    topic_excludes: list[str]
    model_config = {"from_attributes": True}


class UpdateStrategyRequest(BaseModel):
    content_pillars: Optional[list[str]] = None
    posting_frequency: Optional[int] = None
    topic_includes: Optional[list[str]] = None
    topic_excludes: Optional[list[str]] = None


class OnboardingStepRequest(BaseModel):
    step: str
    data: dict


class OnboardingStateResponse(BaseModel):
    current_step: str
    completed_steps: list[str]
    completed_at: Optional[datetime]
    model_config = {"from_attributes": True}


class CreatorContextResponse(BaseModel):
    """Full context blob used by the Intelligence module."""
    creator_id: str
    name: Optional[str]
    niche: Optional[str]
    industry: Optional[str]
    brand_voice: Optional[str]
    target_audience: Optional[str]
    languages: list[str]
    spice_level: int
    preferred_hook_styles: list[str]
    cta_keywords: list[str]
    content_pillars: list[str]
    topic_excludes: list[str]
    posting_frequency: int
