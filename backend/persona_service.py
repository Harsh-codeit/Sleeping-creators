# backend/persona_service.py
"""Evolving per-client persona: build from winning/recent posts, refresh weekly,
format for prompt injection. Import-safe; fails open everywhere."""
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta
import anthropic

logger = logging.getLogger(__name__)

PERSONA_VERSION = 3
PERSONA_MAX_AGE_DAYS = 7
MIN_WINNERS_FOR_SIGNAL = 3
RECENT_SIGNAL_LIMIT = 10


def format_persona_block(persona: dict | None) -> str:
    """Render a persona dict into a prompt-injection block. Empty string if no persona."""
    if not persona:
        return ""
    lines = ["\n\nCLIENT PERSONA (write in this exact voice — this is who this brand is):"]
    if persona.get("voice"):
        lines.append(f"Voice: {persona['voice']}")
    if persona.get("signature_traits"):
        lines.append("Signature traits: " + "; ".join(str(t) for t in persona["signature_traits"]))
    if persona.get("recurring_themes"):
        lines.append("Recurring themes: " + ", ".join(str(t) for t in persona["recurring_themes"]))
    if persona.get("winning_patterns"):
        lines.append("What has worked for this account: " + "; ".join(str(t) for t in persona["winning_patterns"]))
    if persona.get("audience_portrait"):
        lines.append(f"Audience: {persona['audience_portrait']}")
    if persona.get("avoid"):
        lines.append("Avoid: " + "; ".join(str(t) for t in persona["avoid"]))
    if len(lines) == 1:
        return ""
    return "\n".join(lines)


_SIGNAL_PROJ = {"_id": 0, "text": 1, "caption": 1, "title": 1,
                "carousel_data": 1, "content_type": 1, "engagement_score": 1, "created_at": 1}


async def fetch_persona_signal(client_id: str, db,
                               min_winners: int = MIN_WINNERS_FOR_SIGNAL,
                               recent_limit: int = RECENT_SIGNAL_LIMIT) -> list[dict]:
    """Winner posts if >= min_winners exist, else the most recent published posts.
    Never raises — returns [] on any failure."""
    if not client_id or db is None:
        return []
    try:
        winners = await db.posts.find(
            {"client_id": client_id, "is_winner": True}, _SIGNAL_PROJ
        ).sort("engagement_score", -1).limit(10).to_list(10)
        if len(winners) >= min_winners:
            return winners
        recent = await db.posts.find(
            {"client_id": client_id, "status": "published"}, _SIGNAL_PROJ
        ).sort("created_at", -1).limit(recent_limit).to_list(recent_limit)
        return recent
    except Exception as e:
        logger.warning(f"fetch_persona_signal failed ({e}); returning empty signal")
        return []


def is_persona_fresh(persona: dict | None, max_age_days: int = PERSONA_MAX_AGE_DAYS) -> bool:
    """True when persona exists, matches the current schema version, and is younger than max_age_days."""
    if not persona or persona.get("version") != PERSONA_VERSION:
        return False
    raw = persona.get("updated_at")
    if not raw:
        return False
    try:
        ts = datetime.fromisoformat(raw)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return False
    return (datetime.now(timezone.utc) - ts) < timedelta(days=max_age_days)


_ROOT = os.path.dirname(__file__)


def _anthropic_client():
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


def _signal_snippet(post: dict, max_len: int = 200) -> str:
    """Best available text from a post for persona distillation."""
    text = post.get("text") or post.get("caption") or ""
    if not text:
        cd = post.get("carousel_data") or {}
        slides = cd.get("slides") or []
        if slides:
            text = (slides[0] or {}).get("content", "") or cd.get("title", "")
        text = text or cd.get("title", "") or post.get("title", "")
    return re.sub(r"\s+", " ", str(text)).strip()[:max_len]


def _build_persona_prompt(client: dict, signal_posts: list[dict]) -> str:
    ob = client.get("onboarding_data") or {}
    name = client.get("name", "the brand")
    industry = client.get("industry", "general")
    niche = ob.get("niche") or ""
    problem = ob.get("problem_solved") or ""
    vibe = ob.get("brand_vibe") or ""
    examples = "\n".join(f'- "{_signal_snippet(p)}"' for p in signal_posts if _signal_snippet(p)) or "(no past posts yet)"
    return f"""You distill a brand's content voice into a compact persona.

Brand: {name} ({industry})
Niche: {niche}
Problem solved: {problem}
Brand vibe: {vibe}

Past content that represents this brand (study the voice, recurring themes, and what works):
{examples}

Return ONLY valid JSON (no markdown):
{{
  "voice": "2-3 sentences: how this brand actually sounds",
  "signature_traits": ["3-5 concrete style traits"],
  "recurring_themes": ["3-5 topics this brand owns"],
  "winning_patterns": ["1-3 patterns from the content above that clearly work; [] if no past posts"],
  "audience_portrait": "one line: who we're talking to",
  "avoid": ["2-4 things off-brand for this account"]
}}"""


def _parse_persona(raw: str) -> dict:
    text = (raw or "").strip()
    if "```" in text:
        for part in text.split("```"):
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{"):
                text = p
                break
    return json.loads(text)


async def build_persona(client: dict, signal_posts: list[dict], db) -> dict | None:
    """Call the model to distill a persona from signal_posts. Returns a stamped dict,
    or None on failure (caller falls open)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    prompt = _build_persona_prompt(client, signal_posts)
    try:
        ai = _anthropic_client()
        msg = ai.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        data = _parse_persona(msg.content[0].text)
    except Exception as e:
        logger.warning(f"build_persona failed for {client.get('id')} ({e})")
        return None

    try:
        from usage_service import record_usage
        if db is not None:
            await record_usage(db, msg, generation_type="persona_build",
                               client_id=client.get("id"), client_name=client.get("name"))
    except Exception as e:
        logger.debug(f"persona usage record failed ({e})")

    data["version"] = PERSONA_VERSION
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["source"] = "weekly_refresh" if signal_posts else "onboarding"
    data["based_on_post_ids"] = [p.get("id") for p in signal_posts if p.get("id")]
    return data
