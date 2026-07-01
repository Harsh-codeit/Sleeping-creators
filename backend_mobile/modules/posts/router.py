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

    try:
        upload_ids = []

        # Upload carousel images if present
        for img_url in doc.get("slide_image_urls", []):
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=30) as c:
                r = await c.get(img_url)
                r.raise_for_status()
            uid = await bundle_service.upload_file(
                settings.bundle_api_key, team_id,
                r.content, f"slide_{len(upload_ids)}.png", "image/png"
            )
            upload_ids.append(uid)

        # Upload video if present
        if doc.get("video_url") and not upload_ids:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=60) as c:
                r = await c.get(doc["video_url"])
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
        return {"ok": True, "bundle_post_id": bundle_post_id, "status": "published"}

    except Exception as exc:
        await db.posts.update_one({"id": post_id}, {"$set": {"status": "failed", "error": str(exc), "updated_at": _now_iso()}})
        raise HTTPException(500, f"Publish failed: {exc}")


# ── Calendar ──────────────────────────────────────────────────────────────────

@router.get("/calendar")
async def get_calendar(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
    client_id: Optional[str] = Query(None),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    creator_id = client_id or user_id
    # ISO range for the month
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    month_start = f"{year}-{month:02d}-01"
    month_end = f"{year}-{month:02d}-{last_day:02d}T23:59:59"

    query = {
        "creator_id": creator_id,
        "$or": [
            {"scheduled_at": {"$gte": month_start, "$lte": month_end}},
            {"published_at": {"$gte": month_start, "$lte": month_end}},
            {"created_at": {"$gte": month_start, "$lte": month_end}},
        ],
    }
    posts = await db.posts.find(query, {"_id": 0}).sort("scheduled_at", 1).to_list(200)
    return {"posts": posts, "month": month, "year": year, "total": len(posts)}
