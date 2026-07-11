"""Carousel generation + CRUD routes."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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

    slide_count = max(3, min(int(body.get("slide_count", 7)), 10))
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
                slide_count = max(3, min(int(tpl_doc.get("slide_count", slide_count)), 10))
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

    svc = get_intelligence_service()
    req = CarouselGenerationRequest(
        creator_id=user_id,
        topic=enriched_topic,
        tone=tone,
        slide_count=slide_count,
        platform=platform,
        cta_keyword=cta_keyword or "",
        preferred_hook_type=preferred_hook_type,
        reference_content=body.get("reference_content") or None,
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
        raise HTTPException(500, f"AI generation failed: {exc}")

    # Render PNG slides
    slides_data = [
        {"slide_number": s.slide_number, "heading": s.heading, "body": s.body}
        for s in result.content.slides
    ]
    total_slides = len(slides_data) + 1  # +1 for cover

    slide_image_urls: list[str] = []
    try:
        # Cover slide
        cover_bytes = render_cover_slide(
            title=topic,
            subtitle=f"Thread by @creator",
            brand_handle="@sleepingcreators",
        )
        cover_url = await upload_bytes(cover_bytes, "cover.png", "image/png", folder="carousels")
        slide_image_urls.append(cover_url)

        # Content slides
        for i, s in enumerate(slides_data):
            png = render_slide(
                heading=s["heading"],
                body=s["body"],
                slide_number=i + 1,
                total_slides=len(slides_data),
                brand_handle="@sleepingcreators",
            )
            url = await upload_bytes(png, f"slide_{i+1}.png", "image/png", folder="carousels")
            slide_image_urls.append(url)
    except Exception as exc:
        # Slide rendering failure is non-fatal — continue without images
        import logging
        logging.getLogger(__name__).warning("PNG render failed: %s", exc)
        slide_image_urls = []

    carousel_id = str(uuid.uuid4())
    now = _now_iso()
    carousel_doc = {
        "id": carousel_id,
        "creator_id": user_id,
        "topic": topic,
        "tone": tone,
        "generation_id": result.generation_id,
        "template_id": template_id,
        "slides": slides_data,
        "slide_image_urls": slide_image_urls,
        "caption": result.content.caption,
        "hashtags": result.content.hashtags,
        "cta_text": result.content.cta_text,
        "platform": platform,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    await db.carousels.insert_one(carousel_doc)
    _clean(carousel_doc)

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
