# backend/persona_service.py
"""Evolving per-client persona: build from winning/recent posts, refresh weekly,
format for prompt injection. Import-safe; fails open everywhere."""
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta

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
