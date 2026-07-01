from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class TemplateResponse(BaseModel):
    id: str
    user_id: str
    name: str
    kind: str
    format: str
    scope: str
    color_scheme: Optional[str]
    font_style: Optional[str]
    layout_style: Optional[str]
    niche: Optional[str]
    description: Optional[str]
    canvas: Optional[dict]
    thumbnail_url: Optional[str]
    is_starter: bool
    version: int
    status: str
    slide_count: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CreateTemplateRequest(BaseModel):
    name: str
    kind: str = "carousel"
    format: str = "4:5"
    scope: str = "personal"
    color_scheme: Optional[str] = None
    font_style: Optional[str] = None
    layout_style: Optional[str] = None
    niche: Optional[str] = None
    description: Optional[str] = None
    canvas: Optional[dict] = None
    slide_count: int = 7
    status: str = "draft"


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    format: Optional[str] = None
    scope: Optional[str] = None
    color_scheme: Optional[str] = None
    font_style: Optional[str] = None
    layout_style: Optional[str] = None
    niche: Optional[str] = None
    description: Optional[str] = None
    canvas: Optional[dict] = None
    slide_count: Optional[int] = None
    status: Optional[str] = None
    thumbnail_url: Optional[str] = None


class TemplateListResponse(BaseModel):
    templates: list[TemplateResponse]
    total: int
