"""TypedDict state definitions for all Intelligence LangGraph state machines."""
from __future__ import annotations

from typing import Any, Literal, Optional, TypedDict


class CreatorContext(TypedDict):
    creator_id: str
    name: str
    niche: str
    industry: str
    brand_voice: str
    target_audience: str
    languages: list[str]
    spice_level: int
    preferred_hook_styles: list[str]
    cta_keywords: list[str]
    content_pillars: list[str]
    topic_excludes: list[str]
    recent_post_dna: list[dict]        # last N ContentDNA records (for anti-repetition)
    winning_examples: list[dict]       # top-performing posts (for style reference)


class VarietySpec(TypedDict):
    hook_type: str
    opening_structure: str
    emotion: str
    format: str


class GateResult(TypedDict):
    passed: bool
    score: float
    method: str                        # "cosine" | "jaccard" | "none"
    closest_match_id: Optional[str]
    closest_match_preview: Optional[str]


class GeneratedContent(TypedDict):
    format: str
    hook_type: str
    opening_structure: str
    slides: list[dict]                 # [{slide_number, heading, body, visual_cue}]
    caption: str
    hashtags: list[str]
    cta_text: Optional[str]
    raw_json: dict


# ── Main generation state ─────────────────────────────────────────────────────

class ContentGenerationState(TypedDict):
    # Inputs
    creator_id: str
    topic: str
    format: Literal["carousel", "video", "text"]
    slide_count: int
    platform: str
    cta_keyword: Optional[str]
    cta_offer: Optional[str]
    preferred_hook_type: Optional[str]

    # Built during graph execution
    creator_context: Optional[CreatorContext]
    trending_topics: list[str]
    variety_spec: Optional[VarietySpec]
    exemplar_hooks: list[str]          # retrieved from hook library for inspiration

    # Generated
    generated_content: Optional[GeneratedContent]
    best_candidate: Optional[GeneratedContent]    # best content seen across retries

    # Gate
    gate_result: Optional[GateResult]
    retry_count: int
    max_retries: int

    # Metadata
    generation_id: str
    model_used: str
    tokens_used: int
    latency_ms: int
    error: Optional[str]


# ── Content plan state ────────────────────────────────────────────────────────

class ContentPlanDay(TypedDict):
    date: str
    day_of_week: str
    topic: str
    format: str
    hook_type: str
    emotion: str
    brief: str


class ContentPlanState(TypedDict):
    creator_id: str
    week_start: str                    # ISO date string "YYYY-MM-DD"
    topics_override: list[str]
    posting_frequency: int

    creator_context: Optional[CreatorContext]
    trending_topics: list[str]
    plan_days: list[ContentPlanDay]

    plan_id: str
    status: str
    error: Optional[str]
