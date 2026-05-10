import os
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_TYPE_TO_FALLBACK_ROLE = {
    "text": "ai_text",
    "video": "clip",
    "image": "logo",
    "audio": "audio",
    "shape": "decorative",
    "rectangle": "decorative",
    "ellipse": "decorative",
    "composition": "decorative",
}

_TYPE_TO_KIND = {
    "text": "text",
    "video": "video",
    "image": "image",
    "audio": "audio",
    "shape": "shape",
    "rectangle": "shape",
    "ellipse": "shape",
    "composition": "composition",
}


def classify_by_type_only(elements: list[dict]) -> list[dict]:
    """Fallback classification when Claude is unreachable. Type-only inference."""
    out = []
    for el in elements:
        name = el.get("name", "")
        etype = (el.get("type") or "").lower()
        role = _TYPE_TO_FALLBACK_ROLE.get(etype, "decorative")
        kind = _TYPE_TO_KIND.get(etype, "static")
        out.append({
            "key": name,
            "role": role,
            "kind": kind,
            "ai_hint": None,
            "max_chars": None,
            "inferred": True,
        })
    return out


_PROMPT = """You classify elements of a video template for an automation platform.

For each element, return one of these roles:
- ai_text: text content varies per render (headline, subhead, CTA copy)
- static_text: text is part of the brand template, never overridden (e.g. tagline, brand name)
- clip: a video slot that should be filled from a clip library
- logo: a brand-asset image
- brand_style: a color/font that should track the client's brand
- audio: background music slot, overridable per render
- decorative: a shape, layout image, or composition that should never be overridden

Return JSON ONLY: an array of objects {{"key": str, "role": str, "kind": str, "ai_hint": str|null}}.
- "kind" mirrors the source type: text|video|image|color|audio
- "ai_hint" is a short note for the text generator (only for ai_text), e.g. "opening hook, ≤60 chars, punchy". null otherwise.
- The array order MUST match the input order.

Elements:
{elements_json}
"""


def _anthropic_client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


def classify_with_claude(elements: list[dict]) -> list[dict]:
    """Classify via Claude. Raises on any failure (caller falls back)."""
    client = _anthropic_client()
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": _PROMPT.format(elements_json=json.dumps([
                {"name": e.get("name"), "type": e.get("type"),
                 "current_value": e.get("text") or e.get("source") or e.get("fill_color") or e.get("color")}
                for e in elements
            ], indent=2)),
        }],
    )
    raw = msg.content[0].text.strip()
    # Strip ``` fences if Claude wrapped the JSON
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    parsed = json.loads(raw)
    return [{
        "key": p["key"],
        "role": p["role"],
        "kind": p.get("kind", "text"),
        "ai_hint": p.get("ai_hint"),
        "max_chars": None,
        "inferred": True,
    } for p in parsed]


def classify(elements: list[dict]) -> list[dict]:
    """Try Claude; fall back to type-only on any failure."""
    try:
        return classify_with_claude(elements)
    except Exception as e:
        logger.warning("Claude classification failed, falling back to type-only: %s", e)
        return classify_by_type_only(elements)
