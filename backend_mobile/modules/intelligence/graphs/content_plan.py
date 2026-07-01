"""ContentPlanGraph — generates a 7-day content calendar for a creator.

Flow:
  LoadCreatorContext → FetchTrends → SelectTopics → GeneratePlan → SavePlan → END
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import date, timedelta

from anthropic import AsyncAnthropic
from langgraph.graph import END, StateGraph

from backend_mobile.config import settings
from backend_mobile.modules.intelligence.graphs.state import ContentPlanState
from backend_mobile.modules.intelligence.graphs.tools.trend_tool import get_trending_topics
from backend_mobile.modules.intelligence.models import ContentPlan
from backend_mobile.modules.intelligence.prompts.carousel_strategist import (
    CAROUSEL_INDIA_FRAMING,
    CAROUSEL_STRATEGIST_PERSONA,
)

logger = logging.getLogger(__name__)

_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def load_creator_context(state: ContentPlanState, *, db) -> dict:
    """Load creator context. Stub — wires to creator.service in production."""
    ctx = state.get("creator_context") or {
        "creator_id": state["creator_id"],
        "name": "",
        "niche": "",
        "brand_voice": "",
        "target_audience": "",
        "content_pillars": [],
        "preferred_hook_styles": [],
        "cta_keywords": [],
        "recent_post_dna": [],
        "winning_examples": [],
    }
    return {"creator_context": ctx}


async def fetch_plan_trends(state: ContentPlanState, *, db, redis) -> dict:
    niche = (state.get("creator_context") or {}).get("niche", "")
    topics = await get_trending_topics(niche, db, redis, limit=15)
    return {"trending_topics": topics}


async def generate_plan(state: ContentPlanState, *, anthropic_client: AsyncAnthropic) -> dict:
    ctx = state.get("creator_context") or {}
    trending = state.get("trending_topics") or []
    override_topics = state.get("topics_override") or []
    frequency = state.get("posting_frequency") or 5

    week_start = state.get("week_start", str(date.today()))
    try:
        start = date.fromisoformat(week_start)
    except ValueError:
        start = date.today()

    day_dates = [str(start + timedelta(days=i)) for i in range(7)]

    topics_block = ""
    if override_topics:
        topics_block = "TOPICS TO COVER:\n" + "\n".join(f"- {t}" for t in override_topics)
    elif trending:
        topics_block = "TRENDING TOPICS (pick what fits):\n" + "\n".join(f"- {t}" for t in trending[:10])

    system = (
        "You are a senior content strategist. Generate a 7-day Instagram content calendar.\n"
        + CAROUSEL_INDIA_FRAMING
    )

    user_prompt = f"""CREATOR:
Niche: {ctx.get('niche', 'general')}
Brand voice: {ctx.get('brand_voice', 'conversational')}
Content pillars: {', '.join(ctx.get('content_pillars', []))}
Target audience: {ctx.get('target_audience', '')}
Posting frequency this week: {frequency} posts

WEEK: {week_start}
Dates: {', '.join(day_dates)}

{topics_block}

RULES:
- Distribute {frequency} posts across 7 days (some days may have no post).
- Vary format across the week: mix carousel, text post, video.
- Vary hook types across the week — never repeat the same hook type twice in a row.
- Each brief should be 1-2 sentences describing what the post will say and who it's for.
- If frequency < 7, schedule on Mon/Wed/Fri/Sat first, then fill remaining slots.

OUTPUT: valid JSON array with exactly 7 objects (one per day):
[
  {{
    "date": "YYYY-MM-DD",
    "day_of_week": "Monday",
    "topic": "<post topic or empty string if rest day>",
    "format": "carousel|video|text",
    "hook_type": "<hook type or empty if rest day>",
    "emotion": "<primary emotion or empty if rest day>",
    "brief": "<1-2 sentence brief or 'Rest day' if no post>"
  }}
]
"""

    try:
        response = await anthropic_client.messages.create(
            model=settings.default_generation_model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = response.content[0].text
        plan_data = json.loads(raw_text)
    except json.JSONDecodeError:
        import re
        match = re.search(r"\[[\s\S]+\]", raw_text)
        if match:
            plan_data = json.loads(match.group())
        else:
            logger.error("Failed to parse content plan JSON")
            return {"error": "Failed to parse content plan", "plan_days": []}
    except Exception as exc:
        logger.error("Content plan generation failed: %s", exc)
        return {"error": str(exc), "plan_days": []}

    return {"plan_days": plan_data, "error": None}


async def save_plan(state: ContentPlanState, *, db) -> dict:
    if state.get("error"):
        return {"status": "failed"}

    plan_id = str(uuid.uuid4())
    try:
        from datetime import datetime, timezone
        week_dt = datetime.fromisoformat(state["week_start"]).replace(tzinfo=timezone.utc)
        await db.content_plans.insert_one({
            "id": plan_id,
            "creator_id": state["creator_id"],
            "week_start": week_dt.isoformat(),
            "plan_json": {"days": state.get("plan_days", [])},
            "status": "draft",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.error("Failed to save content plan: %s", exc)
        return {"plan_id": plan_id, "status": "unsaved"}

    return {"plan_id": plan_id, "status": "draft"}


def build_content_plan_graph(db, redis, anthropic_client: AsyncAnthropic):
    import functools

    def _bind(fn, **kwargs):
        @functools.wraps(fn)
        async def _wrapper(state):
            return await fn(state, **kwargs)
        return _wrapper

    g = StateGraph(ContentPlanState)

    g.add_node("LoadCreatorContext", _bind(load_creator_context, db=db))
    g.add_node("FetchTrends", _bind(fetch_plan_trends, db=db, redis=redis))
    g.add_node("GeneratePlan", _bind(generate_plan, anthropic_client=anthropic_client))
    g.add_node("SavePlan", _bind(save_plan, db=db))

    g.set_entry_point("LoadCreatorContext")
    g.add_edge("LoadCreatorContext", "FetchTrends")
    g.add_edge("FetchTrends", "GeneratePlan")
    g.add_edge("GeneratePlan", "SavePlan")
    g.add_edge("SavePlan", END)

    return g.compile()
