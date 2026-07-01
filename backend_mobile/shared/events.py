"""In-process domain event bus. Modules emit; subscribers consume.
Fire-and-forget: emission never blocks the caller.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

Handler = Callable[[dict], Coroutine]

_subscribers: dict[str, list[Handler]] = defaultdict(list)


def subscribe(event_type: str, handler: Handler) -> None:
    _subscribers[event_type].append(handler)


def emit(event_type: str, payload: dict) -> None:
    """Fire and forget — logs handler errors without raising."""
    event = {"type": event_type, "payload": payload, "emitted_at": datetime.now(timezone.utc).isoformat()}
    handlers = _subscribers.get(event_type, []) + _subscribers.get("*", [])
    for handler in handlers:
        asyncio.create_task(_safe_call(handler, event))


async def _safe_call(handler: Handler, event: dict) -> None:
    try:
        await handler(event)
    except Exception as exc:
        logger.warning("Event handler %s failed for %s: %s", handler.__name__, event.get("type"), exc)


# ── Well-known event types ─────────────────────────────────────────────────────
class Events:
    POST_PUBLISHED       = "post.published"
    POST_FAILED          = "post.failed"
    PIPELINE_FAILED      = "pipeline.failed"
    CONTENT_PLAN_READY   = "content_plan.ready"
    METRICS_WEEKLY       = "metrics.weekly_summary"
    USER_CREATED         = "user.created"
    CREATOR_ONBOARDED    = "creator.onboarded"
