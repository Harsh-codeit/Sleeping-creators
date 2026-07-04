"""ContentGenerationGraph — LangGraph state machine for carousel/text generation.

Flow:
  BuildCreatorContext
    → FetchTrends
      → SelectVariety
        → GenerateContent
          → HumanizePass
            → SemanticGate
              → [pass]  → AttachMetadata → END
              → [fail + retries left] → RespecForRetry → GenerateContent
              → [exhausted] → AttachMetadata (ship best candidate) → END
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from anthropic import AsyncAnthropic
from langgraph.graph import END, StateGraph

from backend_mobile.config import settings
from backend_mobile.modules.intelligence.graphs.state import (
    ContentGenerationState,
    GeneratedContent,
    VarietySpec,
)
from backend_mobile.modules.intelligence.graphs.tools.hook_retrieval_tool import retrieve_exemplar_hooks
from backend_mobile.modules.intelligence.graphs.tools.semantic_gate_tool import gate_check
from backend_mobile.modules.intelligence.graphs.tools.trend_tool import get_trending_topics
from backend_mobile.modules.intelligence.prompts.carousel_strategist import (
    AI_TELL_PATTERNS,
    CAPTION_PLATFORM_RULES,
    CAROUSEL_INDIA_FRAMING,
    CAROUSEL_STRATEGIST_PERSONA,
    FORMAT_PICKER_GUIDE,
    PLATFORM_VOICE,
    SLIDE_FORMAT_GUIDANCE,
)

logger = logging.getLogger(__name__)

# Hook type rotation order (least-recently-used cycling lives in variety planner)
_HOOK_TYPES = [
    "family_relationship",
    "emotional_state",
    "relatable_scene",
    "shocking_number",
    "myth_bust",
    "credibility_borrow",
    "direct_confront",
]

_OPENING_STRUCTURES = [
    "question",
    "number",
    "scene",
    "confession",
    "myth_bust",
    "quote",
    "statement",
]

_EMOTIONS = [
    "validation",
    "aspiration",
    "anger",
    "guilt",
    "hope",
    "nostalgia",
    "fomo",
    "pride",
]


def _strip_ai_tells(text: str) -> str:
    for pattern, replacement in AI_TELL_PATTERNS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text.strip()


def _next_hook_after(current: str) -> str:
    try:
        idx = _HOOK_TYPES.index(current)
        return _HOOK_TYPES[(idx + 1) % len(_HOOK_TYPES)]
    except ValueError:
        return _HOOK_TYPES[0]


# ── Node implementations ───────────────────────────────────────────────────────

async def build_creator_context(state: ContentGenerationState, *, db, redis) -> dict:
    """Load creator context from MongoDB users collection."""
    from bson import ObjectId

    creator_id = state["creator_id"]

    base_context = {
        "creator_id": creator_id,
        "name": "",
        "niche": "",
        "industry": "",
        "brand_voice": "",
        "target_audience": "",
        "languages": ["en"],
        "spice_level": 3,
        "preferred_hook_styles": [],
        "cta_keywords": [],
        "content_pillars": [],
        "topic_excludes": [],
        "posting_frequency": 5,
        "competitors": [],
    }

    # Load user from MongoDB
    try:
        user = await db.users.find_one({"_id": ObjectId(creator_id)})
        if user:
            base_context["name"] = user.get("name", "")
            base_context["niche"] = user.get("niche", "")
            if user.get("brand_voice"):
                base_context["brand_voice"] = user["brand_voice"]
            if user.get("target_audience"):
                base_context["target_audience"] = user["target_audience"]
            if user.get("spice_level") is not None:
                base_context["spice_level"] = int(user["spice_level"])
            niches = user.get("interests", [])
            if niches:
                base_context["content_pillars"] = niches
            if user.get("competitors"):
                base_context["competitors"] = user["competitors"]
    except Exception as exc:
        logger.warning("Creator context load failed for %s: %s — using defaults", creator_id, exc)

    # Load recent content DNA — feeds the LRU variety planner and Claude history prompt
    recent_post_dna: list[dict] = []
    try:
        window_start = (datetime.now(timezone.utc) - timedelta(days=settings.recent_window_days)).isoformat()
        dna_docs = await (
            db.content_dna
            .find(
                {"creator_id": creator_id, "created_at": {"$gte": window_start}},
                {"hook_type": 1, "opening_structure": 1, "emotion": 1,
                 "format": 1, "hook_text_preview": 1, "_id": 0},
            )
            .sort("created_at", -1)
            .limit(50)
            .to_list(50)
        )
        recent_post_dna = dna_docs
        logger.debug("Loaded %d recent DNA entries for creator %s", len(dna_docs), creator_id[:8])
    except Exception as exc:
        logger.warning("Failed to load recent_post_dna for %s: %s", creator_id[:8], exc)

    # Load winning examples — posts saved by the user as favourites or manually tagged
    winning_examples: list[dict] = []
    try:
        winning_docs = await (
            db.content_dna
            .find(
                {"creator_id": creator_id, "is_winner": True},
                {"hook_type": 1, "hook_text_preview": 1, "emotion": 1, "format": 1, "_id": 0},
            )
            .sort("created_at", -1)
            .limit(10)
            .to_list(10)
        )
        winning_examples = winning_docs
    except Exception as exc:
        logger.warning("Failed to load winning_examples for %s: %s", creator_id[:8], exc)

    creator_context = {
        **base_context,
        "recent_post_dna": recent_post_dna,
        "winning_examples": winning_examples,
    }

    return {"creator_context": creator_context}


async def fetch_trends(state: ContentGenerationState, *, db, redis) -> dict:
    niche = (state.get("creator_context") or {}).get("niche", state["topic"])
    topics = await get_trending_topics(niche, db, redis)
    return {"trending_topics": topics}


def select_variety(state: ContentGenerationState) -> dict:
    """Pick hook type, opening structure, and emotion — avoiding recent repeats (LRU)."""
    recent_dna = (state.get("creator_context") or {}).get("recent_post_dna", [])
    retry_count = state.get("retry_count", 0)

    # Preferred hook from request (only for first attempt)
    preferred = state.get("preferred_hook_type")
    if preferred and retry_count == 0:
        hook_type = preferred
    else:
        # Find least-recently-used hook type
        used = [d["hook_type"] for d in recent_dna]
        hook_type = _pick_lru(_HOOK_TYPES, used)

    # Respec on retry: rotate to next hook type
    if retry_count > 0:
        current = (state.get("variety_spec") or {}).get("hook_type", hook_type)
        hook_type = _next_hook_after(current)

    used_structures = [d["opening_structure"] for d in recent_dna]
    opening_structure = _pick_lru(_OPENING_STRUCTURES, used_structures)

    used_emotions = [d["emotion"] for d in recent_dna]
    emotion = _pick_lru(_EMOTIONS, used_emotions)

    # Format: default to tips for carousel, but can be overridden by topic keywords
    format_ = "tips"
    topic_lower = state["topic"].lower()
    if any(w in topic_lower for w in ["story", "journey", "how i", "my "]):
        format_ = "story"
    elif any(w in topic_lower for w in ["step", "how to", "guide"]):
        format_ = "step_by_step"
    elif any(w in topic_lower for w in ["myth", "wrong", "truth", "reality"]):
        format_ = "myth_bust"
    elif any(w in topic_lower for w in ["case", "result", "achieved", "grew"]):
        format_ = "case_study"

    variety_spec: VarietySpec = {
        "hook_type": hook_type,
        "opening_structure": opening_structure,
        "emotion": emotion,
        "format": format_,
    }
    return {"variety_spec": variety_spec}


def _pick_lru(candidates: list[str], used: list[str]) -> str:
    """Return the candidate least recently seen in `used` (or not seen at all)."""
    used_set = set(used)
    not_used = [c for c in candidates if c not in used_set]
    if not_used:
        return not_used[0]
    # All used — find the one furthest back in history
    last_idx = {c: -1 for c in candidates}
    for i, u in enumerate(used):
        if u in last_idx:
            last_idx[u] = i
    return min(candidates, key=lambda c: last_idx.get(c, -1))


async def retrieve_hooks(state: ContentGenerationState, *, db) -> dict:
    spec = state.get("variety_spec") or {}
    ctx = state.get("creator_context") or {}
    hooks = await retrieve_exemplar_hooks(
        hook_type=spec.get("hook_type", "emotional_state"),
        niche=ctx.get("niche", ""),
        db=db,
        creator_id=state["creator_id"],
        limit=5,
    )
    return {"exemplar_hooks": hooks}


async def generate_content(state: ContentGenerationState, *, anthropic_client: AsyncAnthropic) -> dict:
    """Call Claude to generate the full carousel / text post."""
    ctx = state.get("creator_context") or {}
    spec = state.get("variety_spec") or {}
    trending = state.get("trending_topics") or []
    exemplars = state.get("exemplar_hooks") or []
    format_ = state.get("format", "carousel")

    platform = state.get("platform", "instagram")
    slide_count = state.get("slide_count", 7)

    # Build the system prompt
    system = (
        CAROUSEL_STRATEGIST_PERSONA
        + CAROUSEL_INDIA_FRAMING
        + f"\n\nPLATFORM VOICE: {PLATFORM_VOICE.get(platform, '')}"
    )

    # Build the user prompt
    slide_guidance = SLIDE_FORMAT_GUIDANCE.get(spec.get("format", "tips"), "")
    caption_rules = CAPTION_PLATFORM_RULES.get(platform, "")

    exemplar_block = ""
    if exemplars:
        exemplar_block = "\n\nEXEMPLAR HOOKS (for reference — do NOT copy):\n" + "\n".join(
            f"- {h}" for h in exemplars
        )

    # Creator's own recent content — Claude avoids repeating similar hooks/angles
    history_block = ""
    recent_dna = ctx.get("recent_post_dna", [])
    if recent_dna:
        recent_previews = [d.get("hook_text_preview", "") for d in recent_dna[:15] if d.get("hook_text_preview")]
        if recent_previews:
            history_block = (
                "\n\nCREATOR'S RECENT CONTENT (do NOT repeat these angles or hooks — the audience has already seen them):\n"
                + "\n".join(f"- {h}" for h in recent_previews)
            )

    # Winning examples — content this creator has marked as best-performing
    winning_block = ""
    winning_examples = ctx.get("winning_examples", [])
    if winning_examples:
        winning_block = (
            "\n\nWINNING CONTENT PATTERNS (these performed best for this creator — match the energy and style):\n"
            + "\n".join(
                f"- [{ex.get('hook_type', '')}] {ex.get('hook_text_preview', '')}"
                for ex in winning_examples[:5]
                if ex.get("hook_text_preview")
            )
        )

    competitor_block = ""
    competitors = ctx.get("competitors", [])
    if competitors:
        competitor_block = (
            "\n\nCOMPETITOR ACCOUNTS IN THIS NICHE (study the style and angles that work in this space — never copy, but draw inspiration from what resonates with this audience):\n"
            + "\n".join(f"- @{c.lstrip('@')}" for c in competitors[:10])
        )

    trend_block = ""
    if trending:
        trend_block = (
            f"\n\nTRENDING THIS WEEK (weave in naturally if relevant):\n"
            + "\n".join(f"- {t}" for t in trending[:5])
        )

    cta_block = ""
    if state.get("cta_keyword") or state.get("cta_offer"):
        kw = state.get("cta_keyword", "")
        offer = state.get("cta_offer", "")
        cta_block = f"\n\nCTA INSTRUCTIONS: keyword={kw!r}  offer={offer!r}"

    spice = int(ctx.get('spice_level', 3))
    spice_directive = {
        1: "Keep it completely safe, neutral, and non-controversial.",
        2: "Mild edge — slightly bold opinions but nothing that would offend.",
        3: "Balanced — honest and direct without being polarising.",
        4: "Bold — make strong claims, take clear stances, don't hedge.",
        5: "Controversial — challenge mainstream views, provoke thought, make people stop scrolling.",
    }.get(spice, "")

    user_prompt = f"""CREATOR CONTEXT:
Niche: {ctx.get('niche', 'general')}
Industry: {ctx.get('industry', '')}
Target audience: {ctx.get('target_audience', '')}
Brand voice: {ctx.get('brand_voice', 'conversational')}
Content boldness [{spice}/5]: {spice_directive}
Content pillars: {', '.join(ctx.get('content_pillars', []))}

GENERATION REQUEST:
Topic: {state['topic']}
Format type: {spec.get('format', 'tips')}
Hook type to use: {spec.get('hook_type', 'emotional_state')}
Opening structure: {spec.get('opening_structure', 'question')}
Primary emotion to hit: {spec.get('emotion', 'validation')}
Number of slides: {slide_count}
Platform: {platform}

SLIDE FORMAT GUIDANCE:
{slide_guidance}

{caption_rules}
{exemplar_block}
{history_block}
{winning_block}
{competitor_block}
{trend_block}
{cta_block}

OUTPUT FORMAT — respond with valid JSON only, no markdown fences:
{{
  "format": "{spec.get('format', 'tips')}",
  "hook_type": "<one of the 7 hook types>",
  "opening_structure": "<opening structure used>",
  "slides": [
    {{
      "slide_number": 1,
      "heading": "<max 8 words>",
      "body": "<max 45 words>",
      "visual_cue": "<what the designer should show visually>"
    }}
  ],
  "caption": "<full Instagram caption with line breaks>",
  "hashtags": ["tag1", "tag2"],
  "cta_text": "<final slide CTA text>"
}}
"""

    model = (
        settings.default_carousel_model
        if format_ == "carousel"
        else settings.default_generation_model
    )

    t0 = time.monotonic()
    try:
        response = await anthropic_client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        latency_ms = int((time.monotonic() - t0) * 1000)
        raw_text = response.content[0].text
        tokens_used = response.usage.input_tokens + response.usage.output_tokens
    except Exception as exc:
        err = f"Claude API error: {exc}"
        logger.error(err)
        # Raise so the caller gets a real 500, not an empty carousel
        raise RuntimeError(err) from exc

    try:
        raw_json = json.loads(raw_text)
    except json.JSONDecodeError:
        # Try to extract JSON block from fenced markdown
        match = re.search(r"\{[\s\S]+\}", raw_text)
        if match:
            try:
                raw_json = json.loads(match.group())
            except json.JSONDecodeError:
                return {"error": "Claude returned unparseable JSON"}
        else:
            return {"error": "Claude returned unparseable JSON"}

    # Normalise slides
    slides = raw_json.get("slides", [])
    for slide in slides:
        slide["heading"] = _strip_ai_tells(slide.get("heading", ""))
        slide["body"] = _strip_ai_tells(slide.get("body", ""))

    caption = _strip_ai_tells(raw_json.get("caption", ""))

    content: GeneratedContent = {
        "format": raw_json.get("format", spec.get("format", "tips")),
        "hook_type": raw_json.get("hook_type", spec.get("hook_type", "")),
        "opening_structure": raw_json.get("opening_structure", spec.get("opening_structure", "")),
        "slides": slides,
        "caption": caption,
        "hashtags": raw_json.get("hashtags", []),
        "cta_text": raw_json.get("cta_text"),
        "raw_json": raw_json,
    }

    return {
        "generated_content": content,
        "model_used": model,
        "tokens_used": state.get("tokens_used", 0) + tokens_used,
        "latency_ms": state.get("latency_ms", 0) + latency_ms,
        "error": None,
    }


async def semantic_gate(state: ContentGenerationState, *, db) -> dict:
    content = state.get("generated_content")
    if not content:
        return {"gate_result": {"passed": False, "score": 0.0, "method": "none",
                                "closest_match_id": None, "closest_match_preview": None}}

    hook_text = content["slides"][0]["heading"] if content["slides"] else content.get("caption", "")[:256]

    gate_result = await gate_check(
        creator_id=state["creator_id"],
        candidate_text=hook_text,
        embedding=None,
        hook_type=content.get("hook_type", ""),
        db=db,
    )

    # Track the best candidate we've seen (in case we exhaust retries)
    best = state.get("best_candidate")
    if best is None or gate_result["score"] < (state.get("gate_result") or {}).get("score", 1.0):
        best = content

    return {"gate_result": gate_result, "best_candidate": best}


def respec_for_retry(state: ContentGenerationState) -> dict:
    return {"retry_count": state.get("retry_count", 0) + 1}


def attach_metadata(state: ContentGenerationState) -> dict:
    """Final node — picks best available content and stamps generation_id."""
    content = state.get("generated_content") or state.get("best_candidate")
    return {"generated_content": content}


# ── Conditional edges ──────────────────────────────────────────────────────────

def _gate_decision(state: ContentGenerationState) -> Literal["pass", "retry", "exhausted"]:
    gate = state.get("gate_result") or {}
    if gate.get("passed", True):
        return "pass"
    if state.get("retry_count", 0) < state.get("max_retries", 2):
        return "retry"
    return "exhausted"


# ── Graph assembly ─────────────────────────────────────────────────────────────

def build_content_generation_graph(db, redis, anthropic_client: AsyncAnthropic) -> Any:
    """Build and compile the ContentGenerationGraph.

    Args are injected at build time (partial application pattern) so graph nodes
    are plain async callables that LangGraph can execute without DI magic.
    """
    import functools

    def _bind(fn, **kwargs):
        @functools.wraps(fn)
        async def _wrapper(state):
            return await fn(state, **kwargs)
        return _wrapper

    g = StateGraph(ContentGenerationState)

    g.add_node("BuildCreatorContext", _bind(build_creator_context, db=db, redis=redis))
    g.add_node("FetchTrends", _bind(fetch_trends, db=db, redis=redis))
    g.add_node("SelectVariety", select_variety)
    g.add_node("RetrieveHooks", _bind(retrieve_hooks, db=db))
    g.add_node("GenerateContent", _bind(generate_content, anthropic_client=anthropic_client))
    g.add_node("SemanticGate", _bind(semantic_gate, db=db))
    g.add_node("RespecForRetry", respec_for_retry)
    g.add_node("AttachMetadata", attach_metadata)

    g.set_entry_point("BuildCreatorContext")

    g.add_edge("BuildCreatorContext", "FetchTrends")
    g.add_edge("FetchTrends", "SelectVariety")
    g.add_edge("SelectVariety", "RetrieveHooks")
    g.add_edge("RetrieveHooks", "GenerateContent")
    g.add_edge("GenerateContent", "SemanticGate")

    g.add_conditional_edges(
        "SemanticGate",
        _gate_decision,
        {
            "pass": "AttachMetadata",
            "retry": "RespecForRetry",
            "exhausted": "AttachMetadata",
        },
    )

    g.add_edge("RespecForRetry", "SelectVariety")
    g.add_edge("AttachMetadata", END)

    return g.compile()


def make_initial_state(
    creator_id: str,
    topic: str,
    format: str = "carousel",
    slide_count: int = 7,
    platform: str = "instagram",
    cta_keyword: str | None = None,
    cta_offer: str | None = None,
    preferred_hook_type: str | None = None,
    max_retries: int = 2,
) -> ContentGenerationState:
    return ContentGenerationState(
        creator_id=creator_id,
        topic=topic,
        format=format,
        slide_count=slide_count,
        platform=platform,
        cta_keyword=cta_keyword,
        cta_offer=cta_offer,
        preferred_hook_type=preferred_hook_type,
        creator_context=None,
        trending_topics=[],
        variety_spec=None,
        exemplar_hooks=[],
        generated_content=None,
        best_candidate=None,
        gate_result=None,
        retry_count=0,
        max_retries=max_retries,
        generation_id=str(uuid.uuid4()),
        model_used="",
        tokens_used=0,
        latency_ms=0,
        error=None,
    )
