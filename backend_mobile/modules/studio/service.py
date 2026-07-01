"""Studio service — template CRUD (Motor/MongoDB)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.shared.exceptions import ForbiddenError, NotFoundError

# ── Starter templates ─────────────────────────────────────────────────────────
_STARTERS = [
    {
        "name": "Clean Minimal",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "minimal",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Clean dark minimal layout for thought leadership carousels",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#111827", "elements": ["author_block", "heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#111827", "elements": ["heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#111827", "elements": ["heading", "body", "author_block"]},
        }},
    },
    {
        "name": "Bold Gradient",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "purple", "font_style": "bold", "layout_style": "centered",
        "niche": "general", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Bold purple gradient for high-impact content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#5B5BD6", "gradTo": "#111827", "elements": ["heading", "body"]},
            "middle": {"bgType": "gradient", "gradFrom": "#1e1e3a", "gradTo": "#111827", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#5B5BD6", "gradTo": "#111827", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Story Vertical",
        "kind": "carousel", "format": "9:16", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "minimal",
        "niche": "general", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "Vertical format for Instagram Stories and Reels",
        "thumbnail_url": None,
        "canvas": {"format": "9:16", "zones": {
            "first":  {"bgType": "solid", "bg": "#0d0d0d", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0d0d0d", "elements": ["content"]},
            "last":   {"bgType": "solid", "bg": "#0d0d0d", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Startup Founder",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "bold", "layout_style": "left-aligned",
        "niche": "startup", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Raw founder storytelling — lessons, failures, wins",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#0a0a0a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0a0a0a", "elements": ["number", "heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#0a0a0a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Tips & Tricks",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "dark", "font_style": "sans", "layout_style": "numbered",
        "niche": "education", "slide_count": 10, "status": "published", "is_starter": True,
        "description": "Numbered tips format — great for listicles and how-tos",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a1a2e", "gradTo": "#16213e", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#161616", "elements": ["number", "heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a1a2e", "gradTo": "#16213e", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Finance & Money",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "green-dark", "font_style": "bold", "layout_style": "data-driven",
        "niche": "finance", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Money, investing and personal finance content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "solid", "bg": "#0a1a0a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#0d1a0d", "elements": ["stat", "heading", "body"]},
            "last":   {"bgType": "solid", "bg": "#0a1a0a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Fitness & Health",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "orange-dark", "font_style": "bold", "layout_style": "energetic",
        "niche": "fitness", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "High energy fitness, nutrition and wellness carousels",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a0a00", "gradTo": "#2a1200", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#160d00", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a0a00", "gradTo": "#2a1200", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Tech & AI",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "blue-dark", "font_style": "mono", "layout_style": "technical",
        "niche": "technology", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Tech explainers, AI tools and software content",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#000a1a", "gradTo": "#001633", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#000d1a", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#000a1a", "gradTo": "#001633", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Marketing & Growth",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "purple-pink", "font_style": "bold", "layout_style": "punchy",
        "niche": "marketing", "slide_count": 7, "status": "published", "is_starter": True,
        "description": "Marketing tactics, growth hacks and brand building",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#2d0a3a", "gradTo": "#1a0a2a", "elements": ["heading", "body"]},
            "middle": {"bgType": "solid", "bg": "#1a0a2a", "elements": ["heading", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#2d0a3a", "gradTo": "#1a0a2a", "elements": ["heading", "author_block"]},
        }},
    },
    {
        "name": "Mindset & Motivation",
        "kind": "carousel", "format": "4:5", "scope": "global",
        "color_scheme": "gold-dark", "font_style": "serif", "layout_style": "quote-driven",
        "niche": "mindset", "slide_count": 5, "status": "published", "is_starter": True,
        "description": "Motivational quotes, mindset shifts and personal growth",
        "thumbnail_url": None,
        "canvas": {"format": "4:5", "zones": {
            "first":  {"bgType": "gradient", "gradFrom": "#1a1400", "gradTo": "#0d0a00", "elements": ["quote", "heading"]},
            "middle": {"bgType": "solid", "bg": "#0d0a00", "elements": ["quote", "body"]},
            "last":   {"bgType": "gradient", "gradFrom": "#1a1400", "gradTo": "#0d0a00", "elements": ["heading", "author_block"]},
        }},
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    """Remove MongoDB _id before returning to client."""
    if doc:
        doc.pop("_id", None)
    return doc


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def list_templates(
    db: AsyncIOMotorDatabase,
    user_id: str,
    kind: Optional[str] = None,
    niche: Optional[str] = None,
    scope: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> dict:
    query: dict = {
        "$or": [{"scope": "global"}, {"user_id": user_id}]
    }
    if kind:
        query["kind"] = kind
    if niche:
        query["niche"] = niche
    if scope:
        query["scope"] = scope
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    skip = (page - 1) * limit
    total = await db.templates.count_documents(query)
    rows = await db.templates.find(query, {"_id": 0}).sort("is_starter", -1).skip(skip).limit(limit).to_list(limit)

    return {"templates": rows, "total": total, "page": page, "limit": limit}


async def get_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> dict:
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("scope") != "global" and doc.get("user_id") != user_id:
        raise ForbiddenError("You don't have access to this template")
    return doc


async def create_template(db: AsyncIOMotorDatabase, user_id: str, req) -> dict:
    data = req.model_dump() if hasattr(req, "model_dump") else dict(req)
    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "is_starter": False,
        "status": data.get("status", "draft"),
        "created_at": now,
        "updated_at": now,
        **{k: v for k, v in data.items() if k not in ("id", "user_id", "is_starter", "created_at", "updated_at")},
    }
    await db.templates.insert_one(doc)
    return _clean(doc)


async def update_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str, req) -> dict:
    doc = await db.templates.find_one({"id": template_id})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("user_id") != user_id:
        raise ForbiddenError("You don't own this template")

    data = req.model_dump(exclude_none=True) if hasattr(req, "model_dump") else {k: v for k, v in dict(req).items() if v is not None}
    data["updated_at"] = _now_iso()
    await db.templates.update_one({"id": template_id}, {"$set": data})

    updated = await db.templates.find_one({"id": template_id}, {"_id": 0})
    return updated


async def delete_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> None:
    doc = await db.templates.find_one({"id": template_id})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("user_id") != user_id:
        raise ForbiddenError("You don't own this template")
    await db.templates.delete_one({"id": template_id})


async def clone_template(db: AsyncIOMotorDatabase, template_id: str, user_id: str) -> dict:
    doc = await db.templates.find_one({"id": template_id}, {"_id": 0})
    if not doc:
        raise NotFoundError("Template not found")
    if doc.get("scope") != "global" and doc.get("user_id") != user_id:
        raise ForbiddenError("You don't have access to this template")

    now = _now_iso()
    clone = {
        **doc,
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": f"{doc['name']} (copy)",
        "scope": "personal",
        "is_starter": False,
        "status": "draft",
        "cloned_from": template_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.templates.insert_one(clone)
    clone.pop("_id", None)
    return clone


async def seed_starters(db: AsyncIOMotorDatabase) -> int:
    """Seed global starter templates. Idempotent — skips names already present."""
    now = _now_iso()
    seeded = 0
    for s in _STARTERS:
        already = await db.templates.find_one({"name": s["name"], "is_starter": True})
        if not already:
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": "system",
                "created_at": now,
                "updated_at": now,
                "cloned_from": None,
                **s,
            }
            await db.templates.insert_one(doc)
            seeded += 1
    return seeded
