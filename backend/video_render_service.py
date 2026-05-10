import os
import json
import logging
import uuid
import tempfile
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _anthropic_client():
    import anthropic
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


_AI_TEXT_PROMPT = """You write short text for a social media video.

Brand context:
- Name: {client_name}
- Niche: {niche}
- Voice: {brand_voice}

Topic: {topic}

Generate text for these fields. Match each field's hint and max_chars exactly.
Return ONLY valid JSON: {{"<field_key>": "<text>", ...}} — no explanation.

Fields:
{fields}
"""


async def build_modifications(
    db,
    template: dict,
    client: dict,
    pipeline: Optional[dict],
    ai_text_overrides: Optional[dict] = None,
    music_url: Optional[str] = None,
    clip_drive_ids: Optional[list[str]] = None,
) -> dict:
    """Walk the template's field_schema and produce the modifications dict for Creatomate.

    Merge order per field:
      ai_text:     ai_text_overrides[key] OR Claude-generated (later)
      clip:        staged R2 url for next clip in clip_drive_ids
      logo:        client.brand_overrides.logo_url
      brand_style: client.brand_overrides.color (or font_family for font keys)
      audio:       music_url > pipeline.music_url > client.brand_overrides.default_music_url
      static_text/decorative: skipped (template default used)

    A field is included in the output ONLY when we have a value to override with.
    Missing values fall through to the template's baked-in defaults.
    """
    mods: dict = {}
    overrides = (client or {}).get("brand_overrides", {}) or {}
    pipeline_music = (pipeline or {}).get("music_url") if pipeline else None
    clip_drive_ids = list(clip_drive_ids or [])
    clip_iter = iter(clip_drive_ids)
    ai_text_overrides = ai_text_overrides or {}

    for field in template.get("field_schema", []):
        key = field["key"]
        role = field.get("role")

        if role == "ai_text":
            val = ai_text_overrides.get(key)
            if val is not None:
                mods[key] = val
        elif role == "clip":
            try:
                drive_id = next(clip_iter)
            except StopIteration:
                continue
            from clip_staging_service import stage_clip
            r2_url = await stage_clip(db, client["id"], drive_id)
            mods[key] = r2_url
        elif role == "logo":
            v = overrides.get("logo_url")
            if v:
                mods[key] = v
        elif role == "brand_style":
            if field.get("kind") == "color" and overrides.get("color"):
                mods[key] = overrides["color"]
            elif field.get("kind") == "text" and overrides.get("font_family"):
                # Per-element font override uses dot notation
                mods[f"{key}.font_family"] = overrides["font_family"]
        elif role == "audio":
            v = music_url or pipeline_music or overrides.get("default_music_url")
            if v:
                mods[key] = v
        # static_text and decorative: skip
    return mods


async def generate_ai_text(ai_text_fields: list[dict], client: dict, topic: str) -> dict:
    """Call Claude once to fill all ai_text fields. Returns {key: text}."""
    if not ai_text_fields:
        return {}

    client_name = client.get("name", "the brand")
    niche = client.get("niche") or client.get("industry") or "general"
    brand_voice = client.get("brand_voice", "neutral")
    fields_for_prompt = [{
        "key": f["key"],
        "hint": f.get("ai_hint") or "short caption",
        "max_chars": f.get("max_chars") or 80,
    } for f in ai_text_fields]

    prompt = _AI_TEXT_PROMPT.format(
        client_name=client_name, niche=niche, brand_voice=brand_voice,
        topic=topic, fields=json.dumps(fields_for_prompt, indent=2),
    )
    msg = _anthropic_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    return json.loads(raw)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _log_phase(db, render_job_id: str, phase: str, **fields):
    """Append a structured render-phase log entry to db.logs."""
    try:
        await db.logs.insert_one({
            "kind": "creatomate_render",
            "render_job_id": render_job_id,
            "phase": phase,
            "ts": _now_iso(),
            **fields,
        })
    except Exception as e:
        logger.warning("phase log insert failed (%s): %s", phase, e)


async def submit_render_for_post(
    db,
    post: dict,
    clip_drive_ids: Optional[list[str]] = None,
    music_url: Optional[str] = None,
    pipeline: Optional[dict] = None,
) -> dict:
    """Submit a render to Creatomate for the given post and write a render_jobs row.

    1. Loads template + client.
    2. AI-fills text fields, stages clips, builds modifications.
    3. Token-bucket gates the Creatomate API.
    4. Submits the render.
    5. Inserts render_jobs row, links post.render_job_id.
    6. Returns the render_jobs document.
    """
    template = await db.creatomate_templates.find_one({"id": post["template_id"]})
    if not template:
        raise RuntimeError(f"Template {post['template_id']} not found")
    if template.get("status") != "active":
        raise RuntimeError(f"Template {post['template_id']} is not active (status={template.get('status')})")

    client = await db.clients.find_one({"id": post["client_id"]})
    if not client:
        raise RuntimeError(f"Client {post['client_id']} not found")

    ai_text_fields = [f for f in template.get("field_schema", []) if f.get("role") == "ai_text"]
    manual_overrides = post.get("ai_text_overrides") or {}
    if manual_overrides:
        ai_text_overrides = manual_overrides
    else:
        topic = post.get("topic") or post.get("caption") or client.get("name", "")
        ai_text_overrides = await generate_ai_text(ai_text_fields, client, topic) if ai_text_fields else {}

    modifications = await build_modifications(
        db=db, template=template, client=client, pipeline=pipeline,
        ai_text_overrides=ai_text_overrides, music_url=music_url, clip_drive_ids=clip_drive_ids,
    )

    import creatomate_rate_limiter, creatomate_service
    bucket = creatomate_rate_limiter.get_default_bucket()
    if not bucket.acquire(max_wait_sec=30):
        raise creatomate_service.CreatomateRateLimited(retry_after=10)

    webhook_url = os.environ.get("CREATOMATE_WEBHOOK_URL") or None
    submit_resp = await creatomate_service.submit_render(
        template_id=template["creatomate_template_id"],
        modifications=modifications,
        webhook_url=webhook_url,
    )

    job = {
        "id": str(uuid.uuid4()),
        "post_id": post["id"],
        "client_id": post["client_id"],
        "pipeline_id": post.get("pipeline_id"),
        "template_id": template["id"],
        "creatomate_render_id": submit_resp.get("id"),
        "modifications": modifications,
        "status": "submitted",
        "submitted_at": _now_iso(),
        "completed_at": None,
        "output_url": None,
        "snapshot_url": None,
        "r2_video_url": None,
        "r2_snapshot_url": None,
        "error": None,
        "retry_count": 0,
    }
    await db.render_jobs.insert_one(job)
    await db.posts.update_one({"id": post["id"]}, {"$set": {"render_job_id": job["id"]}})
    await _log_phase(db, job["id"], "submitted", post_id=post["id"])
    return job


async def mirror_to_r2(video_url: str, snapshot_url, client_id: str, render_id: str) -> tuple:
    """Download Creatomate's output (and snapshot) and upload to R2. Returns (r2_video_url, r2_snapshot_url)."""
    import httpx
    import storage

    # video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        video_path = tf.name
    try:
        async with httpx.AsyncClient(timeout=120) as c:
            async with c.stream("GET", video_url) as r:
                r.raise_for_status()
                with open(video_path, "wb") as out:
                    async for chunk in r.aiter_bytes():
                        out.write(chunk)
        r2_video_url = storage.upload_file(
            video_path,
            f"video-renders/{client_id}/{render_id}.mp4",
            content_type="video/mp4",
        )
    finally:
        try:
            os.unlink(video_path)
        except OSError:
            pass

    # snapshot
    r2_snapshot_url = None
    if snapshot_url:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
            snap_path = tf.name
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                resp = await c.get(snapshot_url)
                resp.raise_for_status()
                with open(snap_path, "wb") as out:
                    out.write(resp.content)
            r2_snapshot_url = storage.upload_file(
                snap_path,
                f"video-renders/{client_id}/{render_id}.jpg",
                content_type="image/jpeg",
            )
        finally:
            try:
                os.unlink(snap_path)
            except OSError:
                pass

    return r2_video_url, r2_snapshot_url


async def _fetch_url_bytes(url: str) -> bytes:
    import httpx
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content


def _platform_overrides_for_video(post: dict, platforms: list[str]) -> dict:
    """Per-platform field overrides for a video post."""
    import bundle_service
    caption = post.get("caption", "")
    hashtags = post.get("hashtags") or []
    full_text = caption + ("\n\n" + " ".join(hashtags) if hashtags else "")

    out = {}
    for p in platforms:
        bp = bundle_service.PLATFORM_MAP.get(p)
        if not bp:
            continue
        out[bp] = {"text": full_text, "uploadIds": post.get("_upload_ids", [])}
    return out


async def handoff_to_bundle(db, post: dict, r2_video_url: str, r2_snapshot_url: Optional[str]) -> str:
    """Upload mp4 to Bundle and create a Bundle scheduled post. Returns bundle_post_id."""
    import bundle_service
    from server import get_settings

    client = await db.clients.find_one({"id": post["client_id"]})
    if not client:
        raise RuntimeError(f"Client {post['client_id']} missing")
    team_id = client.get("bundle_team_id")
    if not team_id:
        raise RuntimeError(f"Client {post['client_id']} has no bundle_team_id")

    settings = await get_settings()
    api_key = settings.get("bundle_api_key", "")
    if not api_key:
        raise RuntimeError("bundle_api_key not configured")

    mp4_bytes = await _fetch_url_bytes(r2_video_url)
    upload_id = await bundle_service.upload_file(
        api_key, team_id, mp4_bytes, "video.mp4", "video/mp4",
    )

    platforms = post.get("target_platforms") or ([post.get("platform")] if post.get("platform") else client.get("platforms", []))
    platforms = [p for p in platforms if p]
    overrides_post = {**post, "_upload_ids": [upload_id]}
    platform_overrides = _platform_overrides_for_video(overrides_post, platforms)

    bundle_resp = await bundle_service.create_post(
        api_key=api_key,
        team_id=team_id,
        platforms=platforms,
        text=(post.get("caption") or "")[:2200],
        post_date=post["scheduled_at"],
        upload_ids=[upload_id],
        platform_overrides=platform_overrides,
        title=(post.get("caption") or "Video")[:100],
    )
    bundle_post_id = bundle_resp.get("id") or bundle_resp.get("postId") or bundle_resp.get("_id")
    if not bundle_post_id:
        raise RuntimeError(f"Bundle create_post returned no id: {bundle_resp}")

    await db.posts.update_one(
        {"id": post["id"]},
        {"$set": {"status": "bundle_scheduled", "bundle_post_id": bundle_post_id}},
    )
    logger.info("bundle_scheduled post_id=%s bundle_post_id=%s", post["id"], bundle_post_id)
    return bundle_post_id
