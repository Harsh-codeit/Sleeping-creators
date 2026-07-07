"""Video generation via Shotstack + AI merge-field filling."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
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


async def _generate_script_text(prompt: str) -> str:
    """Generate script text using Groq (fast) with Claude Haiku as fallback."""
    # Try Groq first — faster and cheaper for structured JSON generation
    if settings.groq_api_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.groq_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 2048,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Groq video script failed, falling back to Claude: %s", exc)

    # Fallback: Claude Haiku
    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("Claude Haiku video script also failed: %s", exc)
        return ""


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


# ── AI Script Generation (no Shotstack required) ──────────────────────────────

@router.post("/videos/script")
async def generate_video_script(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Generate a full video script using Claude AI.
    Body: {topic, hook_style, duration, tone, cta, audience, notes, template_id?, platform?, scheduled_at?}
    Returns: {post_id, script: {headline, hook, scenes, hashtags, cta, description}}
    """
    topic = body.get("topic", "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")

    hook_style = body.get("hook_style", "Question")
    duration = body.get("duration", "30 seconds")
    tone = body.get("tone", "Educational")
    cta_text = body.get("cta", "Follow for more")
    audience = body.get("audience", "")
    notes = body.get("notes", "")
    platform = body.get("platform", "instagram")
    scheduled_at = body.get("scheduled_at")

    # Load preferences from MongoDB video template if provided
    num_scenes = 5
    video_flow = "Hook → Content → CTA"
    template_id = body.get("template_id")
    if template_id:
        tpl = await db.templates.find_one({"id": template_id, "kind": "video"}, {"_id": 0})
        if tpl:
            num_scenes = tpl.get("number_of_scenes", num_scenes)
            video_flow = tpl.get("video_flow", video_flow)

    prompt = f"""You are a professional Instagram Reels scriptwriter.

Create a complete video script for a {duration} Instagram Reel.

TOPIC: {topic}
TONE: {tone}
HOOK STYLE: {hook_style}
CALL TO ACTION: {cta_text}
TARGET AUDIENCE: {audience or "Creators and entrepreneurs"}
CONTENT FLOW: {video_flow}
NUMBER OF SCENES: {num_scenes}
{f"EXTRA NOTES: {notes}" if notes else ""}

Return ONLY valid JSON with no markdown or explanation:
{{
  "headline": "Punchy video title (max 60 chars)",
  "hook": "Opening line that stops the scroll (1-2 sentences)",
  "scenes": [
    {{
      "number": 1,
      "title": "Scene name",
      "caption": "Text shown on screen (max 70 chars, punchy)",
      "voiceover": "What the creator says in this scene (2-3 sentences)"
    }}
  ],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "cta": "{cta_text}",
  "description": "Full Instagram caption (2-3 sentences then hashtags)"
}}

Generate exactly {num_scenes} scenes following the {video_flow} structure.
Make content specific and actionable — no generic filler."""

    raw = await _generate_script_text(prompt)
    if not raw:
        raise HTTPException(502, "AI generation failed — please try again")
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        script = json.loads(raw)
    except Exception:
        raise HTTPException(500, "AI returned invalid format, please try again")

    # Save as draft post in MongoDB
    post_id = str(uuid.uuid4())
    now = _now_iso()
    doc = {
        "id": post_id,
        "creator_id": user_id,
        "platform": platform,
        "content_type": "video",
        "topic": topic,
        "caption": script.get("description", f"{script.get('headline', topic)}\n\n{cta_text}"),
        "hashtags": script.get("hashtags", []),
        "slides": [],
        "slide_image_urls": [],
        "video_url": None,
        "video_script": script,
        "status": "draft",
        "scheduled_at": scheduled_at,
        "published_at": None,
        "bundle_post_id": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.posts.insert_one(doc)
    _clean(doc)

    return {"post_id": post_id, "script": script}


# ── User video upload ─────────────────────────────────────────────────────────

_ALLOWED_VIDEO_TYPES = {
    "video/mp4", "video/quicktime", "video/x-m4v", "video/webm", "video/mov",
}
_MAX_VIDEO_BYTES = 60 * 1024 * 1024  # 60 MB


@router.post("/videos/upload")
async def upload_user_video(
    file: UploadFile = File(...),
    user_id: str = Depends(_current_user_id),
):
    """
    Upload a short video clip (≤60 MB) to R2 for caption-overlay rendering.
    Returns: {video_url, key}
    """
    from backend_mobile.modules.posts.r2_client import upload_bytes
    from backend_mobile.config import settings as _s

    content_type = (file.content_type or "video/mp4").lower()
    if content_type not in _ALLOWED_VIDEO_TYPES:
        raise HTTPException(400, f"Unsupported video type '{content_type}'. Use MP4 or MOV.")

    data = await file.read()
    if len(data) > _MAX_VIDEO_BYTES:
        raise HTTPException(413, "Video file exceeds the 60 MB limit")

    ext = "mp4"
    if "quicktime" in content_type or "mov" in content_type:
        ext = "mov"
    elif "webm" in content_type:
        ext = "webm"

    video_url = await upload_bytes(data, f"clip.{ext}", content_type, folder="user_videos")
    key = video_url.replace(f"{_s.r2_public_url}/", "")

    return {"video_url": video_url, "key": key}


# ── Caption-overlay render ────────────────────────────────────────────────────

@router.post("/videos/{post_id}/render")
async def render_video_with_captions(
    post_id: str,
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Overlay AI script captions on the uploaded clip via Shotstack.
    Body: {video_url: str, total_duration: float}
    Returns: {render_id, post_id, status: "rendering"}
    """
    from backend_mobile.modules.posts.shotstack_service import submit_render_timeline
    from backend_mobile.modules.posts.video_render import build_caption_timeline

    video_url = (body.get("video_url") or "").strip()
    total_duration = float(body.get("total_duration") or 15.0)

    if not video_url:
        raise HTTPException(400, "video_url is required")

    post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Post not found")
    if post.get("creator_id") != user_id:
        raise HTTPException(403, "Forbidden")

    script = post.get("video_script")
    if not script:
        raise HTTPException(400, "Post has no video_script — generate a script first")

    timeline = build_caption_timeline(video_url, script, total_duration)

    try:
        render_id = await submit_render_timeline(timeline)
    except Exception as exc:
        raise HTTPException(502, f"Shotstack render failed: {exc}")

    if not render_id:
        raise HTTPException(502, "Shotstack did not return a render ID")

    await db.posts.update_one(
        {"id": post_id},
        {"$set": {
            "video_url": video_url,
            "render_id": render_id,
            "status": "rendering",
            "updated_at": _now_iso(),
        }}
    )

    return {"render_id": render_id, "post_id": post_id, "status": "rendering"}
