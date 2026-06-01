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
