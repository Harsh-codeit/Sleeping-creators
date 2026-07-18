"""Posts module — CRUD + Calendar endpoint."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.database import get_db
from backend_mobile.modules.iam.router import _current_user_id

router = APIRouter(prefix="/api", tags=["posts"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if doc:
        doc.pop("_id", None)
    return doc


# ── Posts CRUD ────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    client_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
    status: Optional[str] = Query(None),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    creator_id = client_id or user_id
    query: dict = {"creator_id": creator_id}
    if status:
        query["status"] = status

    total = await db.posts.count_documents(query)
    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"posts": posts, "total": total}


@router.post("/posts", status_code=201)
async def create_post(
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "creator_id": user_id,
        "platform": body.get("platform", "instagram"),
        "content_type": body.get("content_type", "carousel"),
        "caption": body.get("caption", ""),
        "hashtags": body.get("hashtags", []),
        "slides": body.get("slides", []),
        "slide_image_urls": body.get("slide_image_urls", []),
        "video_url": body.get("video_url"),
        "status": body.get("status", "draft"),
        "scheduled_at": body.get("scheduled_at"),
        "published_at": None,
        "bundle_post_id": None,
        "carousel_id": body.get("carousel_id"),
        "render_id": body.get("render_id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.posts.insert_one(doc)
    return _clean(doc)


@router.get("/posts/{post_id}")
async def get_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.posts.find_one({"id": post_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Post not found")
    return doc


@router.put("/posts/{post_id}")
async def update_post(
    post_id: str,
    body: dict,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Post not found")

    allowed = {"caption", "hashtags", "slides", "status", "scheduled_at", "platform", "content_type"}
    updates = {k: v for k, v in body.items() if k in allowed}
    updates["updated_at"] = _now_iso()

    await db.posts.update_one({"id": post_id}, {"$set": updates})
    return await db.posts.find_one({"id": post_id}, {"_id": 0})


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.posts.delete_one({"id": post_id})
    return {"ok": True}


@router.post("/posts/{post_id}/approve")
async def approve_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Post not found")
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "scheduled", "updated_at": _now_iso()}})
    return {"ok": True, "status": "scheduled"}


@router.post("/posts/{post_id}/publish")
async def publish_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from backend_mobile.config import settings
    from backend_mobile.modules.iam import service as iam_service
    from backend_mobile.modules.publishing import bundle_service

    doc = await db.posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Post not found")

    creator_id = doc.get("creator_id", user_id)
    try:
        user = await iam_service.get_user_by_id(db, creator_id)
    except Exception:
        raise HTTPException(400, "Creator not found")

    team_id = user.get("bundle_team_id")
    if not team_id:
        raise HTTPException(400, "Instagram not connected. Go to Settings → Connect Instagram first.")

    caption = doc.get("caption", "")
    hashtags = doc.get("hashtags", [])
    full_text = caption + ("\n\n" + " ".join(hashtags) if hashtags else "")
    scheduled_at = doc.get("scheduled_at") or _now_iso()

    # ── Gather media (Instagram requires ≥1 upload) ──────────────────────────
    # Post images → linked carousel's images → render on-demand from slides.
    slide_image_urls = list(doc.get("slide_image_urls") or [])
    slides_data = doc.get("slides") or []
    carousel_id = doc.get("carousel_id")
    video_url = doc.get("video_url")

    if not slide_image_urls and carousel_id:
        carousel = await db.carousels.find_one({"id": carousel_id}, {"_id": 0})
        if carousel:
            slide_image_urls = list(carousel.get("slide_image_urls") or [])
            if not slides_data:
                slides_data = carousel.get("slides") or []

    # Still no rendered images but we have slide content → render them now.
    if not slide_image_urls and not video_url and slides_data:
        from backend_mobile.modules.posts.slide_renderer import render_slide, render_cover_slide
        from backend_mobile.modules.posts.r2_client import upload_bytes
        topic = doc.get("topic") or (caption[:40] if caption else "") or "Carousel"
        try:
            cover_bytes = render_cover_slide(title=topic, subtitle="", brand_handle="@sleepingcreators")
            slide_image_urls.append(await upload_bytes(cover_bytes, "cover.png", "image/png", folder="carousels"))
            for i, s in enumerate(slides_data):
                png = render_slide(
                    heading=s.get("heading", ""), body=s.get("body", ""),
                    slide_number=i + 1, total_slides=len(slides_data), brand_handle="@sleepingcreators",
                )
                slide_image_urls.append(await upload_bytes(png, f"slide_{i+1}.png", "image/png", folder="carousels"))
            # Cache back onto the post (and carousel) so we don't re-render next time
            await db.posts.update_one({"id": post_id}, {"$set": {"slide_image_urls": slide_image_urls}})
            if carousel_id:
                await db.carousels.update_one({"id": carousel_id}, {"$set": {"slide_image_urls": slide_image_urls}})
        except Exception as exc:
            raise HTTPException(500, f"Could not render slides before publishing: {exc}")

    # Nothing to attach → give a clear reason instead of Bundle's cryptic 400.
    if not slide_image_urls and not video_url:
        raise HTTPException(
            400,
            "This post has no image or video to publish. Instagram needs at least one — "
            "open the post in the editor and generate or add slides first.",
        )

    try:
        upload_ids = []

        # Upload carousel images
        for img_url in slide_image_urls:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=30) as c:
                r = await c.get(img_url)
                r.raise_for_status()
            uid = await bundle_service.upload_file(
                settings.bundle_api_key, team_id,
                r.content, f"slide_{len(upload_ids)}.png", "image/png"
            )
            upload_ids.append(uid)

        # Upload video if present (and no images)
        if video_url and not upload_ids:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=60) as c:
                r = await c.get(video_url)
                r.raise_for_status()
            uid = await bundle_service.upload_file(
                settings.bundle_api_key, team_id,
                r.content, "video.mp4", "video/mp4"
            )
            upload_ids.append(uid)

        result = await bundle_service.create_post(
            api_key=settings.bundle_api_key,
            team_id=team_id,
            platforms=["instagram"],
            text=full_text,
            post_date=scheduled_at,
            upload_ids=upload_ids,
        )
        bundle_post_id = result.get("id") or result.get("postId") or result.get("_id", "")

        await db.posts.update_one({"id": post_id}, {"$set": {
            "status": "published",
            "published_at": _now_iso(),
            "bundle_post_id": bundle_post_id,
            "updated_at": _now_iso(),
        }})

        # Flag the content DNA entry as published so the AI knows this made it to production
        try:
            carousel_id = doc.get("carousel_id")
            if carousel_id:
                carousel = await db.carousels.find_one({"id": carousel_id}, {"generation_id": 1})
                if carousel and carousel.get("generation_id"):
                    await db.content_dna.update_one(
                        {"generation_id": carousel["generation_id"]},
                        {"$set": {"published": True, "post_id": post_id}},
                    )
        except Exception:
            pass  # non-fatal

        # Push notification — non-fatal
        try:
            from backend_mobile.modules.notifications.fcm import send_push_to_user
            await send_push_to_user(
                db, creator_id,
                title="Post published! 🎉",
                body="Your content is now live on Instagram.",
                data={"post_id": post_id},
            )
        except Exception:
            pass

        return {"ok": True, "bundle_post_id": bundle_post_id, "status": "published"}

    except Exception as exc:
        await db.posts.update_one({"id": post_id}, {"$set": {"status": "failed", "error": str(exc), "updated_at": _now_iso()}})
        raise HTTPException(500, f"Publish failed: {exc}")


@router.post("/posts/{post_id}/star")
async def star_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Mark a post as a winning example so future AI generations reference its style."""
    doc = await db.posts.find_one({"id": post_id, "creator_id": user_id})
    if not doc:
        raise HTTPException(404, "Post not found")

    is_starred = not doc.get("starred", False)
    await db.posts.update_one({"id": post_id}, {"$set": {"starred": is_starred, "updated_at": _now_iso()}})

    # Mirror the winner flag on the content DNA entry
    try:
        carousel_id = doc.get("carousel_id")
        if carousel_id:
            carousel = await db.carousels.find_one({"id": carousel_id}, {"generation_id": 1})
            if carousel and carousel.get("generation_id"):
                await db.content_dna.update_one(
                    {"generation_id": carousel["generation_id"]},
                    {"$set": {"is_winner": is_starred}},
                )
    except Exception:
        pass

    return {"ok": True, "starred": is_starred}


# ── Calendar ──────────────────────────────────────────────────────────────────

@router.get("/calendar")
async def get_calendar(
    start: str = Query(..., description="ISO datetime range start"),
    end: str = Query(..., description="ISO datetime range end"),
    client_id: Optional[str] = Query(None),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    creator_id = client_id or user_id
    query = {
        "creator_id": creator_id,
        "$or": [
            {"scheduled_at": {"$gte": start, "$lte": end}},
            {"published_at": {"$gte": start, "$lte": end}},
        ],
    }
    posts = await db.posts.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(200)
    return {"posts": posts, "total": len(posts)}
