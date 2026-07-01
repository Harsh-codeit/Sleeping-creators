"""Video generation via Shotstack + AI merge-field filling."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.database import get_db
from backend_mobile.modules.iam.router import _current_user_id

router = APIRouter(prefix="/api", tags=["video"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


async def _ai_fill_merge_fields(
    template_merge_fields: list[dict],
    topic: str,
    tone: str,
    hook: str,
    cta: str,
    duration: str,
    notes: str,
) -> dict[str, str]:
    """Use Claude to generate text for each Shotstack merge field."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    field_names = [f.get("find", f.get("key", "")) for f in template_merge_fields if f.get("find") or f.get("key")]
    if not field_names:
        return {}

    prompt = f"""You are writing copy for a short social media video about: "{topic}"
Tone: {tone or "engaging and professional"}
Hook style: {hook or "question"}
CTA: {cta or "Follow for more"}
Duration: {duration or "30 seconds"}
Extra notes: {notes or "none"}

Fill each of these Shotstack template merge fields with appropriate short text.
Return ONLY a JSON object with field names as keys and short text values.
Keep each value under 80 characters. Fields: {json.dumps(field_names)}"""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text.strip()
    # Strip markdown code block if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except Exception:
        # Fallback: assign topic to first field
        return {field_names[0]: topic} if field_names else {}


# ── Shotstack templates ───────────────────────────────────────────────────────

@router.get("/shotstack-templates")
async def list_shotstack_templates(
    kind: Optional[str] = Query("video"),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Check cache in MongoDB first (TTL index on created_at expires after 1 hour)
    cached = await db.shotstack_templates.find({}, {"_id": 0}).to_list(50)
    if cached:
        return {"templates": cached}

    from backend_mobile.modules.posts.shotstack_service import list_templates
    try:
        templates = await list_templates(settings.shotstack_key)
    except Exception as exc:
        raise HTTPException(502, f"Shotstack error: {exc}")

    # Cache in MongoDB
    if templates:
        await db.shotstack_templates.delete_many({})
        docs = [
            {**t, "cached_at": _now_iso()}
            for t in templates
        ]
        await db.shotstack_templates.insert_many(docs)

    return {"templates": templates}


# ── Video generation ──────────────────────────────────────────────────────────

@router.post("/videos/generate")
async def generate_video(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Body: {topic, hook_style, duration, tone, cta, template_id, notes, platform, scheduled_at}
    Returns: {post_id, render_id, status: "rendering"}
    """
    from backend_mobile.modules.posts.shotstack_service import get_template, submit_render

    topic = body.get("topic", "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")

    template_id = body.get("template_id")
    tone = body.get("tone", "professional")
    hook = body.get("hook_style") or body.get("hook", "")
    cta = body.get("cta", "Follow for more")
    duration = body.get("duration", "30 seconds")
    notes = body.get("notes", "")
    platform = body.get("platform", "instagram")
    scheduled_at = body.get("scheduled_at")

    # Get template details + merge fields
    template_data = None
    merge_fields_schema: list[dict] = []
    if template_id:
        try:
            template_data = await get_template(settings.shotstack_key, template_id)
            merge_fields_schema = template_data.get("mergeFields", []) or template_data.get("merge", [])
        except Exception:
            template_data = None

    # AI generates text for each merge field
    if merge_fields_schema:
        merge_values = await _ai_fill_merge_fields(
            merge_fields_schema, topic, tone, hook, cta, duration, notes
        )
    else:
        merge_values = {
            "HEADLINE": topic[:60],
            "SUBTEXT": f"Your guide to {topic}",
            "CTA": cta,
        }

    # Submit render to Shotstack
    try:
        render_result = await submit_render(
            api_key=settings.shotstack_key,
            template=template_data,
            merge_values=merge_values,
        )
        render_id = render_result.get("id") or render_result.get("render_id", "")
    except Exception as exc:
        raise HTTPException(502, f"Shotstack render submit failed: {exc}")

    # Save post to MongoDB
    post_id = str(uuid.uuid4())
    now = _now_iso()
    caption_text = f"{topic}\n\n{cta}"
    doc = {
        "id": post_id,
        "creator_id": user_id,
        "platform": platform,
        "content_type": "video",
        "caption": caption_text,
        "hashtags": [],
        "slides": [],
        "slide_image_urls": [],
        "video_url": None,
        "render_id": render_id,
        "shotstack_template_id": template_id,
        "merge_values": merge_values,
        "status": "rendering",
        "scheduled_at": scheduled_at,
        "published_at": None,
        "bundle_post_id": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.posts.insert_one(doc)
    _clean(doc)

    return {
        "post_id": post_id,
        "render_id": render_id,
        "status": "rendering",
        "merge_values": merge_values,
    }


@router.get("/videos/job/{render_id}")
async def poll_video_job(
    render_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from backend_mobile.modules.posts.shotstack_service import poll_render

    try:
        result = await poll_render(settings.shotstack_key, render_id)
    except Exception as exc:
        raise HTTPException(502, f"Shotstack poll failed: {exc}")

    status = result.get("status", "rendering")
    video_url = result.get("url")

    # Update post record when done
    if status == "done" and video_url:
        await db.posts.update_many(
            {"render_id": render_id},
            {"$set": {"video_url": video_url, "status": "ready", "updated_at": _now_iso()}}
        )

    return {"render_id": render_id, "status": status, "video_url": video_url}
