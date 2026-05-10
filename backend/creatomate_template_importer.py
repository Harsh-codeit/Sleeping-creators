import os
import json
import logging
import uuid
from typing import Optional
from datetime import datetime, timezone

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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _aspect_ratio(width: int | None, height: int | None) -> str | None:
    if not width or not height:
        return None
    from math import gcd
    g = gcd(width, height)
    return f"{width // g}:{height // g}"


def _extract_defaults(elements: list[dict]) -> dict:
    out = {}
    for el in elements:
        name = el.get("name")
        if not name:
            continue
        val = el.get("text") or el.get("source") or el.get("fill_color") or el.get("color")
        if val is not None:
            out[name] = val
    return out


async def sync_templates(db) -> dict:
    """Sync templates from Creatomate to db.creatomate_templates. Returns summary."""
    import creatomate_service

    templates = await creatomate_service.list_templates()
    added, updated = [], []
    seen_creatomate_ids = set()

    for tpl in templates:
        cm_id = tpl.get("id")
        if not cm_id:
            continue
        seen_creatomate_ids.add(cm_id)
        full = await creatomate_service.get_template_source(cm_id)
        source_obj = full.get("source") or {}
        elements = source_obj.get("elements") or []
        field_schema = classify(elements)
        defaults = _extract_defaults(elements)

        # width/height/duration live inside source, not at the top level
        width = full.get("width") or source_obj.get("width")
        height = full.get("height") or source_obj.get("height")
        duration = full.get("duration") or source_obj.get("duration")
        thumbnail_url = (
            full.get("snapshot_url")
            or full.get("preview_url")
            or tpl.get("snapshot_url")
            or tpl.get("preview_url")
        )

        existing = await db.creatomate_templates.find_one({"creatomate_template_id": cm_id})
        now = _now_iso()
        common = {
            "creatomate_template_id": cm_id,
            "name": full.get("name", tpl.get("name", "Untitled")),
            "thumbnail_url": thumbnail_url,
            "duration_seconds": duration,
            "aspect_ratio": _aspect_ratio(width, height),
            "field_schema": field_schema,
            "defaults": defaults,
            "last_synced_at": now,
        }

        if existing:
            # Preserve admin overrides on existing rows: don't overwrite roles already
            # marked inferred=False. Replace only inferred=True rows.
            preserved = {f["key"]: f for f in existing.get("field_schema", []) if not f.get("inferred", True)}
            common["field_schema"] = [preserved.get(f["key"], f) for f in field_schema]
            await db.creatomate_templates.update_one(
                {"id": existing["id"]},
                {"$set": common},
            )
            updated.append({"id": existing["id"], "creatomate_template_id": cm_id, "name": common["name"]})
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "imported_at": now,
                "status": "draft",
                **common,
            }
            await db.creatomate_templates.update_one(
                {"creatomate_template_id": cm_id},
                {"$setOnInsert": doc},
                upsert=True,
            )
            added.append({"id": doc["id"], "creatomate_template_id": cm_id, "name": common["name"]})

    # Soft-deactivate any DB row whose creatomate_template_id is no longer in the workspace
    deactivated = []
    async for row in db.creatomate_templates.find({"creatomate_template_id": {"$nin": list(seen_creatomate_ids)}}):
        if row.get("status") != "inactive":
            await db.creatomate_templates.update_one({"id": row["id"]}, {"$set": {"status": "inactive"}})
            deactivated.append({"id": row["id"], "creatomate_template_id": row["creatomate_template_id"]})

    return {"added": added, "updated": updated, "deactivated": deactivated}
