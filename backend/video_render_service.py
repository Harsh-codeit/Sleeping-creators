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


async def generate_ai_text(ai_text_fields: list[dict], client: dict, topic: str) -> dict:
    """Call Claude once to fill all ai_text fields. Returns {find_name: text}."""
    if not ai_text_fields:
        return {}

    client_name = client.get("name", "the brand")
    niche = client.get("niche") or client.get("industry") or "general"
    brand_voice = client.get("brand_voice", "neutral")
    fields_for_prompt = [{
        "key": f["find"],
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


_CONTENT_PROMPT = """You are writing content for a social media video post.

Client:
- Name: {client_name}
- Niche: {niche}
- Brand voice: {brand_voice}
- Platforms: {platforms}

Prompt: {prompt}

Generate all content in one response:

1. "merge_values" — text for each field that appears inside the video. Match each field's hint and max_chars exactly.
2. "caption" — the social media post caption that accompanies the video. Engaging, matches brand voice, max 2200 chars.
3. "hashtags" — array of 20 relevant hashtags without the # symbol.

Video fields:
{fields}

Return ONLY valid JSON — no explanation, no markdown fences:
{{
  "merge_values": {{{merge_values_example}}},
  "caption": "...",
  "hashtags": ["tag1", "tag2"]
}}"""


async def generate_video_content(
    prompt: str,
    client: dict,
    ai_text_fields: list[dict],
) -> dict:
    """One Claude call → {merge_values: {FIELD: text}, caption: str, hashtags: [str]}."""
    client_name = client.get("name", "the brand")
    niche = client.get("niche") or client.get("industry") or "general"
    brand_voice = client.get("brand_voice", "neutral")
    platforms = ", ".join(client.get("platforms") or ["instagram"])

    fields_json = json.dumps([{
        "field": f["find"],
        "hint": f.get("ai_hint") or "short punchy text",
        "max_chars": f.get("max_chars") or 80,
    } for f in ai_text_fields], indent=2) if ai_text_fields else "[]"

    example_kv = ", ".join(f'"{f["find"]}": "..."' for f in ai_text_fields) if ai_text_fields else ""

    full_prompt = _CONTENT_PROMPT.format(
        client_name=client_name, niche=niche, brand_voice=brand_voice,
        platforms=platforms, prompt=prompt,
        fields=fields_json, merge_values_example=example_kv,
    )

    msg = _anthropic_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        messages=[{"role": "user", "content": full_prompt}],
    )
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    data = json.loads(raw)
    return {
        "merge_values": data.get("merge_values") or {},
        "caption": data.get("caption") or "",
        "hashtags": data.get("hashtags") or [],
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _log_phase(db, render_job_id: str, phase: str, **fields):
    try:
        await db.logs.insert_one({
            "kind": "shotstack_render",
            "render_job_id": render_job_id,
            "phase": phase,
            "ts": _now_iso(),
            **fields,
        })
    except Exception as e:
        logger.warning("phase log insert failed (%s): %s", phase, e)


async def build_merge_values(
    db,
    template: dict,
    client: dict,
    pipeline: Optional[dict],
    ai_text_overrides: Optional[dict] = None,
    music_url: Optional[str] = None,
    clip_drive_ids: Optional[list[str]] = None,
    generated_merge_values: Optional[dict] = None,
) -> dict:
    """
    Build the merge_values dict {FIELD_NAME: value} for a Shotstack render.

    Merge order per field role:
      ai_text:      ai_text_overrides[find] OR Claude-generated
      clip:         staged R2 url for next clip in clip_drive_ids
      logo:         client.brand_overrides.logo_url
      audio:        music_url > pipeline.music_url > client brand default
      static_text:  skipped (template default used)

    Fields without a value are omitted — Shotstack uses the template default.
    """
    overrides = (client or {}).get("brand_overrides", {}) or {}
    pipeline_music = (pipeline or {}).get("music_url") if pipeline else None
    clip_iter = iter(list(clip_drive_ids or []))
    ai_text_overrides = ai_text_overrides or {}

    ai_text_fields = [f for f in template.get("merge_fields", []) if f.get("role") == "ai_text"]
    unfilled_ai = [f for f in ai_text_fields if f["find"] not in ai_text_overrides]

    # Priority: explicit overrides > pre-generated values > Claude fallback
    generated: dict = generated_merge_values or {}
    still_unfilled = [f for f in unfilled_ai if f["find"] not in generated]
    if still_unfilled:
        try:
            generated.update(await generate_ai_text(still_unfilled, client, ""))
        except Exception as e:
            logger.warning("AI text generation failed: %s", e)

    values: dict = {}
    for field in template.get("merge_fields", []):
        find = field["find"]
        role = field.get("role", "ai_text")

        if role == "ai_text":
            val = ai_text_overrides.get(find) or generated.get(find)
            if val:
                values[find] = val
        elif role == "clip":
            try:
                drive_id = next(clip_iter)
            except StopIteration:
                continue
            from clip_staging_service import stage_clip
            r2_url = await stage_clip(db, client["id"], drive_id)
            values[find] = r2_url
        elif role == "logo":
            v = overrides.get("logo_url")
            if v:
                values[find] = v
        elif role == "audio":
            v = music_url or pipeline_music or overrides.get("default_music_url")
            if v:
                values[find] = v
        # static_text: skip

    return values


async def submit_render_for_post(
    db,
    post: dict,
    clip_drive_ids: Optional[list[str]] = None,
    music_url: Optional[str] = None,
    pipeline: Optional[dict] = None,
) -> dict:
    """
    Submit a Shotstack render for the given post and write a render_jobs row.

    1. Loads template + client.
    2. Re-fetches template source from Shotstack (required — we mutate it per render).
    3. Builds merge values.
    4. Submits to Shotstack.
    5. Inserts render_jobs doc, links post.render_job_id.
    Returns the render_jobs document.
    """
    from shotstack_service import get_template, submit_render

    template = await db.shotstack_templates.find_one({"id": post["template_id"]})
    if not template:
        raise RuntimeError(f"Template {post['template_id']} not found")
    if template.get("status") != "active":
        raise RuntimeError(f"Template {post['template_id']} is not active (status={template.get('status')})")

    client = await db.clients.find_one({"id": post["client_id"]})
    if not client:
        raise RuntimeError(f"Client {post['client_id']} not found")

    # Re-fetch fresh template source every render (Shotstack rule: never cache timeline)
    template_data = await get_template(template["shotstack_template_id"])

    merge_values = await build_merge_values(
        db=db, template=template, client=client, pipeline=pipeline,
        ai_text_overrides=post.get("ai_text_overrides") or {},
        music_url=music_url,
        clip_drive_ids=clip_drive_ids,
        generated_merge_values=post.get("generated_merge_values") or {},
    )

    filter_name = post.get("filter_name") or None
    audio_url_override = music_url or None

    shotstack_render_id = await submit_render(
        template_data=template_data,
        merge_values=merge_values,
        filter_name=filter_name,
        audio_url=audio_url_override,
    )

    job = {
        "id": str(uuid.uuid4()),
        "post_id": post["id"],
        "client_id": post["client_id"],
        "pipeline_id": post.get("pipeline_id"),
        "template_id": template["id"],
        "shotstack_render_id": shotstack_render_id,
        "merge_values": merge_values,
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
    """Download Shotstack's output and upload to R2. Returns (r2_video_url, r2_snapshot_url)."""
    import httpx
    import storage

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
