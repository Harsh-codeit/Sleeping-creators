"""Carousel generation + CRUD routes."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.database import get_db
from backend_mobile.modules.iam.router import _current_user_id

router = APIRouter(prefix="/api", tags=["carousel"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


# ── AI generation ─────────────────────────────────────────────────────────────

@router.post("/carousel/generate")
async def generate_carousel(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Body: {topic, slide_count, platform, template_id, cta_keyword, tone, audience, key_points}
    Returns: {carousel_id, slides, slide_image_urls, caption, hashtags}
    """
    from backend_mobile.modules.intelligence.service import get_intelligence_service
    from backend_mobile.modules.intelligence.schemas import CarouselGenerationRequest
    from backend_mobile.modules.posts.slide_renderer import render_slide, render_cover_slide
    from backend_mobile.modules.posts.r2_client import upload_bytes

    topic = body.get("topic", "").strip()
    if not topic:
        raise HTTPException(400, "topic is required")

    # User's requested TOTAL slide count (cover + content slides), 1–8.
    slide_count = max(1, min(int(body.get("slide_count", 7)), 8))
    platform = body.get("platform", "instagram")
    cta_keyword = body.get("cta_keyword") or body.get("cta", "")
    template_id = body.get("template_id")

    # Load template to get slide_count + content structure hint
    preferred_hook_type: Optional[str] = None
    _TEMPLATE_TYPE_TO_HOOK = {
        "tips":         "shocking_number",
        "story":        "relatable_scene",
        "tutorial":     "direct_confront",
        "announcement": "credibility_borrow",
        "quote":        "emotional_state",
    }
    template_blueprint = None
    if template_id:
        tpl_doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
        if tpl_doc:
            # Use template's slide_count if caller didn't specify one
            if not body.get("slide_count"):
                slide_count = max(1, min(int(tpl_doc.get("slide_count", slide_count)), 8))
            tpl_type = tpl_doc.get("template_type", "")
            preferred_hook_type = _TEMPLATE_TYPE_TO_HOOK.get(tpl_type)
            template_blueprint = tpl_doc.get("slide_blueprint") or None

    # Build a richer topic string from extra context (tone is now a first-class field)
    tone = body.get("tone", "")
    audience = body.get("audience", "")
    key_points = body.get("key_points") or body.get("keyPoints", "")
    if audience or key_points:
        extras = []
        if audience:
            extras.append(f"audience: {audience}")
        if key_points:
            extras.append(f"key points: {key_points}")
        enriched_topic = f"{topic}. ({', '.join(extras)})"
    else:
        enriched_topic = topic

    # Analyze trending reference URL if provided
    trending_reference_content: Optional[str] = None
    trending_url = (body.get("trending_reference_url") or "").strip()
    if trending_url and "instagram.com" in trending_url:
        try:
            from backend_mobile.modules.intelligence.reel_analyzer import analyze_reel as _analyze_reel
            analysis = await _analyze_reel(trending_url, get_intelligence_service()._anthropic)
            if not analysis.get("error"):
                lines = []
                if analysis.get("transcript_snippet"):
                    lines.append(f"Caption excerpt: {analysis['transcript_snippet']}")
                if analysis.get("opening_hook"):
                    lines.append(f"Hook: {analysis['opening_hook']}")
                if analysis.get("tone"):
                    lines.append(f"Tone: {analysis['tone']}")
                if analysis.get("structure_type"):
                    lines.append(f"Format: {analysis['structure_type']}")
                if analysis.get("key_message"):
                    lines.append(f"Core message: {analysis['key_message']}")
                if analysis.get("hook_techniques"):
                    lines.append(f"Techniques: {analysis['hook_techniques']}")
                if analysis.get("cta_pattern") and analysis["cta_pattern"] != "none":
                    lines.append(f"CTA: {analysis['cta_pattern']}")
                trending_reference_content = "\n".join(lines)
        except Exception as _exc:
            import logging
            logging.getLogger(__name__).warning("Trending URL analysis failed: %s", _exc)

    # Slide 1 is the rendered cover; ask the AI for the remaining content slides
    # so that cover + content equals the user's selection exactly.
    ai_slide_count = max(1, slide_count - 1)
    svc = get_intelligence_service()
    req = CarouselGenerationRequest(
        creator_id=user_id,
        topic=enriched_topic,
        tone=tone,
        slide_count=ai_slide_count,
        platform=platform,
        cta_keyword=cta_keyword or "",
        preferred_hook_type=preferred_hook_type,
        reference_content=body.get("reference_content") or None,
        trending_reference_content=trending_reference_content,
        template_blueprint=template_blueprint,
    )

    # Use a minimal redis-compatible object if redis not available
    try:
        from backend_mobile.main import get_redis
        redis = get_redis()
    except Exception:
        redis = None

    try:
        result = await svc.generate_carousel(req, db, redis)
    except Exception as exc:
        msg = str(exc)
        low = msg.lower()
        if "credit balance is too low" in low or "plans & billing" in low:
            raise HTTPException(
                503,
                "AI generation is temporarily unavailable — the Claude account is out of credit. "
                "Please top up Anthropic billing and try again.",
            )
        if "rate_limit" in low or " 429" in low or "overloaded" in low:
            raise HTTPException(429, "The AI is busy right now. Please try again in a few seconds.")
        raise HTTPException(500, f"AI generation failed: {exc}")

    import logging
    _log = logging.getLogger(__name__)

    # Enforce the exact total: cover + (slide_count - 1) content slides = slide_count.
    # Truncate in case the model returned more than asked.
    slides_data = [
        {"slide_number": s.slide_number, "heading": s.heading, "body": s.body}
        for s in result.content.slides
    ][: max(0, slide_count - 1)]

    # ── Persist the draft FIRST, before any rendering ────────────────────────
    # Rendering/upload can fail (fonts, R2, network); saving first guarantees the
    # AI content is never lost. The topic becomes the draft's heading. Images are
    # a best-effort enrichment written back below (and re-rendered at publish if
    # still missing).
    carousel_id = str(uuid.uuid4())
    now = _now_iso()
    carousel_doc = {
        "id": carousel_id,
        "creator_id": user_id,
        "topic": topic,                       # <- heading shown in Drafts
        "tone": tone,
        "generation_id": result.generation_id,
        "template_id": template_id,
        "slides": slides_data,
        "slide_image_urls": [],
        "caption": result.content.caption,
        "hashtags": result.content.hashtags,
        "cta_text": result.content.cta_text,
        "platform": platform,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.carousels.insert_one(dict(carousel_doc))
    except Exception as exc:
        _log.error("Carousel draft save FAILED (content would be lost): %s", exc)
        raise HTTPException(500, "Generated content could not be saved. Please try again.")

    # ── Render PNG slides (best-effort) and write them back ──────────────────
    slide_image_urls: list[str] = []
    try:
        cover_bytes = render_cover_slide(title=topic, subtitle="Thread by @creator", brand_handle="@sleepingcreators")
        slide_image_urls.append(await upload_bytes(cover_bytes, "cover.png", "image/png", folder="carousels"))
        for i, s in enumerate(slides_data):
            png = render_slide(
                heading=s["heading"], body=s["body"],
                slide_number=i + 1, total_slides=len(slides_data),
                brand_handle="@sleepingcreators",
            )
            slide_image_urls.append(await upload_bytes(png, f"slide_{i+1}.png", "image/png", folder="carousels"))
        await db.carousels.update_one({"id": carousel_id}, {"$set": {"slide_image_urls": slide_image_urls, "updated_at": _now_iso()}})
    except Exception as exc:
        # Draft is already saved; images will render on demand at publish time.
        _log.warning("PNG render failed for carousel %s (draft is safe): %s", carousel_id, exc)
        slide_image_urls = []

    return {
        "carousel_id": carousel_id,
        "slides": slides_data,
        "slide_image_urls": slide_image_urls,
        "caption": result.content.caption,
        "hashtags": result.content.hashtags,
        "cta_text": result.content.cta_text,
        "generation_id": result.generation_id,
        "model_used": result.model_used,
        "latency_ms": result.latency_ms,
    }


# ── Carousels CRUD ────────────────────────────────────────────────────────────

@router.get("/carousels")
async def list_carousels(
    client_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    creator_id = client_id or user_id
    docs = (
        await db.carousels.find({"creator_id": creator_id}, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
    return {"carousels": docs, "total": len(docs)}


@router.get("/carousels/{carousel_id}")
async def get_carousel(
    carousel_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Carousel not found")
    return doc


@router.post("/carousels", status_code=201)
async def save_carousel(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "creator_id": user_id,
        "topic": body.get("topic", ""),
        "slides": body.get("slides", []),
        "slide_image_urls": body.get("slide_image_urls", []),
        "caption": body.get("caption", ""),
        "hashtags": body.get("hashtags", []),
        "generation_id": body.get("generation_id"),
        "template_id": body.get("template_id"),
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    await db.carousels.insert_one(doc)
    return _clean(doc)


@router.patch("/carousels/{carousel_id}")
async def update_carousel(
    carousel_id: str,
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    allowed = {"status", "topic", "caption", "hashtags"}
    update = {k: v for k, v in body.items() if k in allowed}
    if not update:
        raise HTTPException(400, "No valid fields to update")
    update["updated_at"] = _now_iso()
    await db.carousels.update_one({"id": carousel_id}, {"$set": update})
    return {"ok": True}


@router.delete("/carousels/{carousel_id}")
async def delete_carousel(
    carousel_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.carousels.delete_one({"id": carousel_id})
    return {"ok": True}


@router.post("/intelligence/analyze-reel")
async def analyze_reel(
    body: dict,
    user_id: str = Depends(_current_user_id),
):
    """Extract hook structure, tone, and CTA from an Instagram reel URL.

    Body: { reel_url: str }
    Returns structured analysis to be used as reference_content in carousel generation.
    """
    from backend_mobile.modules.intelligence.reel_analyzer import analyze_reel as _analyze
    from backend_mobile.modules.intelligence.service import get_intelligence_service

    reel_url = (body.get("reel_url") or "").strip()
    if not reel_url:
        raise HTTPException(400, "reel_url is required")
    if "instagram.com" not in reel_url:
        raise HTTPException(400, "URL must be an Instagram reel link")

    svc = get_intelligence_service()
    result = await _analyze(reel_url, svc._anthropic)

    if result.get("error") and not result.get("opening_hook"):
        raise HTTPException(422, result["error"])

    return result


# ── Generic file upload (Carousel Builder image elements / author photo) ───────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(_current_user_id),
):
    """Upload an image file and return its public CDN URL.

    Used by Carousel Builder for element images and author profile photos.
    """
    from backend_mobile.modules.posts.r2_client import upload_bytes

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    content_type = file.content_type or "image/png"
    if content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {content_type}. Use JPEG, PNG, WebP, or GIF.")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:  # 10 MB cap
        raise HTTPException(400, "File too large. Maximum 10 MB.")

    ext = (file.filename or "image.png").rsplit(".", 1)[-1].lower()
    url = await upload_bytes(data, f"upload.{ext}", content_type=content_type, folder="uploads")
    return {"url": url, "content_type": content_type}


# ── Carousel export (return slide image URLs for download) ────────────────────

@router.post("/carousels/{carousel_id}/export")
async def export_carousel(
    carousel_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return slide image URLs for a saved carousel.

    If the carousel already has rendered `slide_image_urls`, returns them directly.
    Otherwise re-renders slides and uploads to R2.
    """
    from backend_mobile.modules.posts.slide_renderer import render_slide, render_cover_slide
    from backend_mobile.modules.posts.r2_client import upload_bytes

    doc = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Carousel not found")

    # Use cached renders if already present
    existing = doc.get("slide_image_urls") or []
    if existing:
        return {"images": existing, "count": len(existing)}

    # Re-render from slide data
    slides_data = doc.get("slides") or []
    topic = doc.get("topic", "Carousel")
    slide_image_urls: list[str] = []
    try:
        cover_bytes = render_cover_slide(
            title=topic,
            subtitle="",
            brand_handle="@sleepingcreators",
        )
        cover_url = await upload_bytes(cover_bytes, "cover.png", "image/png", folder="carousels")
        slide_image_urls.append(cover_url)

        for i, s in enumerate(slides_data):
            png = render_slide(
                heading=s.get("heading", ""),
                body=s.get("body", ""),
                slide_number=i + 1,
                total_slides=len(slides_data),
                brand_handle="@sleepingcreators",
            )
            url = await upload_bytes(png, f"slide_{i+1}.png", "image/png", folder="carousels")
            slide_image_urls.append(url)

        # Cache the rendered URLs on the carousel doc
        await db.carousels.update_one(
            {"id": carousel_id},
            {"$set": {"slide_image_urls": slide_image_urls, "updated_at": _now_iso()}},
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Export render failed: %s", exc)
        raise HTTPException(500, f"Slide rendering failed: {exc}")

    return {"images": slide_image_urls, "count": len(slide_image_urls)}


# ── Carousel publish (delegate to posts publish flow) ─────────────────────────

@router.post("/carousels/{carousel_id}/publish")
async def publish_carousel(
    carousel_id: str,
    local_fallback: bool = False,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Publish a carousel to Instagram via Bundle.social.

    Exports slides if not already rendered, creates a post record, then publishes.
    `local_fallback=true` is a no-op flag kept for frontend compatibility.
    """
    from backend_mobile.config import settings
    from backend_mobile.modules.iam import service as iam_service
    from backend_mobile.modules.publishing import bundle_service

    doc = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Carousel not found")

    try:
        user = await iam_service.get_user_by_id(db, user_id)
    except Exception:
        raise HTTPException(400, "User not found")

    team_id = user.get("bundle_team_id")
    if not team_id:
        raise HTTPException(400, "Instagram not connected. Go to Settings → Connect Instagram first.")

    # Ensure we have rendered images
    slide_image_urls = doc.get("slide_image_urls") or []
    if not slide_image_urls:
        # Trigger export inline
        from backend_mobile.modules.posts.slide_renderer import render_slide, render_cover_slide
        from backend_mobile.modules.posts.r2_client import upload_bytes
        topic = doc.get("topic", "Carousel")
        slides_data = doc.get("slides") or []
        try:
            cover_bytes = render_cover_slide(title=topic, subtitle="", brand_handle="@sleepingcreators")
            slide_image_urls.append(await upload_bytes(cover_bytes, "cover.png", "image/png", folder="carousels"))
            for i, s in enumerate(slides_data):
                png = render_slide(
                    heading=s.get("heading", ""), body=s.get("body", ""),
                    slide_number=i + 1, total_slides=len(slides_data), brand_handle="@sleepingcreators",
                )
                slide_image_urls.append(await upload_bytes(png, f"slide_{i+1}.png", "image/png", folder="carousels"))
            await db.carousels.update_one({"id": carousel_id}, {"$set": {"slide_image_urls": slide_image_urls}})
        except Exception as exc:
            raise HTTPException(500, f"Slide rendering failed before publish: {exc}")

    caption = doc.get("caption", "")
    hashtags = doc.get("hashtags", [])
    full_text = caption + ("\n\n" + " ".join(hashtags) if hashtags else "")

    try:
        import httpx as _httpx
        upload_ids: list[str] = []
        for img_url in slide_image_urls:
            async with _httpx.AsyncClient(timeout=30) as c:
                r = await c.get(img_url)
                r.raise_for_status()
            uid = await bundle_service.upload_file(
                settings.bundle_api_key, team_id, r.content, f"slide_{len(upload_ids)}.png", "image/png"
            )
            upload_ids.append(uid)

        result = await bundle_service.create_post(
            api_key=settings.bundle_api_key,
            team_id=team_id,
            platforms=["instagram"],
            text=full_text,
            post_date=_now_iso(),
            upload_ids=upload_ids,
        )
        bundle_post_id = result.get("id") or result.get("postId") or result.get("_id", "")

        await db.carousels.update_one({"id": carousel_id}, {"$set": {
            "status": "published",
            "bundle_post_id": bundle_post_id,
            "updated_at": _now_iso(),
        }})
        return {"status": "published", "bundle_post_id": bundle_post_id}

    except Exception as exc:
        await db.carousels.update_one({"id": carousel_id}, {"$set": {"status": "failed", "updated_at": _now_iso()}})
        raise HTTPException(500, f"Publish failed: {exc}")


# ── Carousel slide preview (real-time editor) ─────────────────────────────────

@router.post("/carousel/preview-slides")
async def preview_slides(
    body: dict,
    user_id: str = Depends(_current_user_id),
):
    """Render preview PNGs for individual slides changed in the Carousel Builder.

    Body: { template, slides: [{index, heading, body, _prev_hash, _prev_url}], ... }
    Returns: { previews: [{index, url, content_hash}] }

    Only re-renders slides whose content_hash has changed since the last call
    (frontend sends `_prev_hash` to identify unchanged slides).
    """
    import hashlib
    from backend_mobile.modules.posts.slide_renderer import render_slide
    from backend_mobile.modules.posts.r2_client import upload_bytes

    slides = body.get("slides") or []
    previews: list[dict] = []

    for s in slides:
        idx = s.get("index", 0)
        heading = s.get("heading") or ""
        body_text = s.get("body") or s.get("content") or ""
        callout = s.get("callout") or ""

        content_hash = hashlib.md5(f"{heading}|{body_text}|{callout}".encode()).hexdigest()

        # Skip re-render if content unchanged
        if content_hash == s.get("_prev_hash") and s.get("_prev_url"):
            previews.append({"index": idx, "url": s["_prev_url"], "content_hash": content_hash})
            continue

        try:
            png = render_slide(
                heading=heading,
                body=body_text,
                slide_number=idx + 1,
                total_slides=len(slides),
                brand_handle="@sleepingcreators",
            )
            url = await upload_bytes(png, f"preview_{idx}.png", "image/png", folder="previews")
            previews.append({"index": idx, "url": url, "content_hash": content_hash})
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Preview render failed for slide %d: %s", idx, exc)
            # Return previous URL if available so UI doesn't blank out
            if s.get("_prev_url"):
                previews.append({"index": idx, "url": s["_prev_url"], "content_hash": s.get("_prev_hash", "")})

    return {"previews": previews}
