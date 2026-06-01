# backend/topic_queue.py
"""Pure topic-queue logic for standard pipelines. The async LLM refill + DB
persistence live in server.py; this module is the testable core."""
import json
import re

QUEUE_LOW_WATERMARK = 3
HISTORY_CAP = 60


def pop_topic(pipeline: dict):
    """Return (topic, updates) where updates is a dict of pipeline fields to $set.
    Pops the queue head; falls back to carousel_topics round-robin; None if nothing."""
    queue = list(pipeline.get("topic_queue") or [])
    history = list(pipeline.get("topic_history") or [])
    if queue:
        topic = queue.pop(0)
        history = ([topic] + history)[:HISTORY_CAP]
        return topic, {"topic_queue": queue, "topic_history": history}
    # Fallback: legacy round-robin over configured topics.
    topics = pipeline.get("carousel_topics") or []
    if topics:
        topic = topics[pipeline.get("total_runs", 0) % len(topics)]
        history = ([topic] + history)[:HISTORY_CAP]
        return topic, {"topic_history": history}
    return None, {}


def needs_refill(pipeline: dict) -> bool:
    return len(pipeline.get("topic_queue") or []) < QUEUE_LOW_WATERMARK


def parse_topic_list(raw: str, exclude: list) -> list:
    """Parse a JSON array of topic strings from an LLM response; drop blanks and excluded."""
    text = (raw or "").strip()
    if "```" in text:
        for part in text.split("```"):
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("["):
                text = p
                break
    try:
        items = json.loads(text)
    except (ValueError, TypeError):
        return []
    excl = {str(e).strip().lower() for e in (exclude or [])}
    out = []
    for it in items if isinstance(items, list) else []:
        s = re.sub(r"\s+", " ", str(it)).strip()
        if s and s.lower() not in excl:
            out.append(s)
    return out
