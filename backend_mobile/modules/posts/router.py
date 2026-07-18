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
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    creator_id = client_id or user_id
    query: dict = {"creator_id": creator_id}
    if status:
        query["status"] = status

    total = await db.posts.count_documents(query)
    posts = (
        await db.posts.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
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
    fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})

    # If the time changed on a post already handed to Bundle, re-sync so it
    # auto-publishes at the NEW time (delete-old + recreate happens in the helper).
    time_changed = "scheduled_at" in updates and updates["scheduled_at"] != doc.get("scheduled_at")
    if fresh and time_changed and doc.get("bundle_post_id") and fresh.get("status") == "scheduled":
        try:
            await _send_post_to_bundle(db, fresh, post_date=updates["scheduled_at"], final_status="scheduled")
            fresh = await db.posts.find_one({"id": post_id}, {"_id": 0})
        except Exception:
            pass  # keep the local reschedule even if Bundle re-sync fails

    return fresh


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await db.posts.delete_one({"id": post_id})
    return {"ok": True}


async def _send_post_to_bundle(db, doc: dict, *, post_date: str, final_status: str) -> str:
    """Upload the post's media and create a Bundle post that publishes at post_date.

    Bundle publishes at post_date — pass "now" for an immediate publish, or a
    future ISO time for an auto-publish later. Sets the post's status to
    final_status. If the post was already sent to Bundle, the previous Bundle
    post is removed first so we never create duplicates (reschedule / publish-now
    after scheduling). Raises HTTPException on failure.
    """
    from backend_mobile.config import settings
    from backend_mobile.modules.iam import service as iam_service
    from backend_mobile.modules.publishing import bundle_service

    post_id = doc["id"]
    creator_id = doc.get("creator_id")
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

    # ── Gather media: post images → linked carousel images → render on demand ──
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
            await db.posts.update_one({"id": post_id}, {"$set": {"slide_image_urls": slide_image_urls}})
            if carousel_id:
                await db.carousels.update_one({"id": carousel_id}, {"$set": {"slide_image_urls": slide_image_urls}})
        except Exception as exc:
            raise HTTPException(500, f"Could not render slides before publishing: {exc}")

    if not slide_image_urls and not video_url:
        raise HTTPException(
            400,
            "This post has no image or video to publish. Instagram needs at least one — "
            "open the post and generate or add slides first.",
        )

    # Remove any previous Bundle post so a reschedule / publish-now doesn't double-post
    old_bundle_id = doc.get("bundle_post_id")
    if old_bundle_id:
        try:
            await bundle_service.delete_post(settings.bundle_api_key, old_bundle_id)
        except Exception:
            pass  # non-fatal

    # ── Upload media to Bundle ──
    import httpx as _httpx
    upload_ids: list[str] = []
    for img_url in slide_image_urls:
        async with _httpx.AsyncClient(timeout=30) as c:
            r = await c.get(img_url)
            r.raise_for_status()
        upload_ids.append(await bundle_service.upload_file(
            settings.bundle_api_key, team_id, r.content, f"slide_{len(upload_ids)}.png", "image/png"))
    if video_url and not upload_ids:
        async with _httpx.AsyncClient(timeout=60) as c:
            r = await c.get(video_url)
            r.raise_for_status()
        upload_ids.append(await bundle_service.upload_file(
            settings.bundle_api_key, team_id, r.content, "video.mp4", "video/mp4"))

    # ── Create the Bundle post (publishes at post_date) ──
    result = await bundle_service.create_post(
        api_key=settings.bundle_api_key, team_id=team_id, platforms=["instagram"],
        text=full_text, post_date=post_date, upload_ids=upload_ids,
    )
    bundle_post_id = result.get("id") or result.get("postId") or result.get("_id", "")

    patch = {"status": final_status, "bundle_post_id": bundle_post_id, "updated_at": _now_iso()}
    if final_status == "published":
        patch["published_at"] = _now_iso()
    await db.posts.update_one({"id": post_id}, {"$set": patch})

    # Flag the content DNA as published (committed to production) — non-fatal
    try:
        if carousel_id:
            carousel = await db.carousels.find_one({"id": carousel_id}, {"generation_id": 1})
            if carousel and carousel.get("generation_id"):
                await db.content_dna.update_one(
                    {"generation_id": carousel["generation_id"]},
                    {"$set": {"published": True, "post_id": post_id}},
                )
    except Exception:
        pass

    # Push only for an immediate publish
    if final_status == "published":
        try:
            from backend_mobile.modules.notifications.fcm import send_push_to_user
            await send_push_to_user(
                db, creator_id, title="Post published! 🎉",
                body="Your content is now live on Instagram.", data={"post_id": post_id},
            )
        except Exception:
            pass

    return bundle_post_id


@router.post("/posts/{post_id}/approve")
async def approve_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Schedule a post. Marks it scheduled locally, and — if Instagram is
    connected — hands it to Bundle with its future time so it auto-publishes."""
    from backend_mobile.modules.iam import service as iam_service

    doc = await db.posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Post not found")

    scheduled_at = doc.get("scheduled_at") or _now_iso()
    # Always reflect "scheduled" locally first (works even without Bundle).
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "scheduled", "updated_at": _now_iso()}})
    doc["scheduled_at"] = scheduled_at

    try:
        user = await iam_service.get_user_by_id(db, doc.get("creator_id", user_id))
        connected = bool(user.get("bundle_team_id"))
    except Exception:
        connected = False

    if not connected:
        return {"ok": True, "status": "scheduled", "auto_publish": False,
                "detail": "Scheduled. Connect Instagram to auto-publish at the set time."}

    # Hand off to Bundle so Instagram publishes automatically at scheduled_at.
    try:
        bundle_post_id = await _send_post_to_bundle(db, doc, post_date=scheduled_at, final_status="scheduled")
        return {"ok": True, "status": "scheduled", "auto_publish": True, "bundle_post_id": bundle_post_id}
    except HTTPException as he:
        return {"ok": True, "status": "scheduled", "auto_publish": False, "detail": he.detail}
    except Exception as exc:
        return {"ok": True, "status": "scheduled", "auto_publish": False, "detail": str(exc)}


@router.post("/posts/{post_id}/publish")
async def publish_post(
    post_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Publish Now — publishes to Instagram immediately (post_date = now),
    regardless of any previously-set scheduled time."""
    doc = await db.posts.find_one({"id": post_id})
    if not doc:
        raise HTTPException(404, "Post not found")

    try:
        bundle_post_id = await _send_post_to_bundle(db, doc, post_date=_now_iso(), final_status="published")
    except HTTPException:
        raise
    except Exception as exc:
        await db.posts.update_one({"id": post_id}, {"$set": {"status": "failed", "error": str(exc), "updated_at": _now_iso()}})
        raise HTTPException(500, f"Publish failed: {exc}")

    return {"ok": True, "bundle_post_id": bundle_post_id, "status": "published"}


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
