"""Internal admin dashboard API — protected by ADMIN_SECRET."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.config import settings
from backend_mobile.database import get_db
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ── Model pricing (per million tokens) ────────────────────────────────────────
MODEL_RATES_PER_M = {
    "claude-haiku-4-5-20251001": 0.80,
    "claude-sonnet-4-6":         3.00,
}
DEFAULT_RATE = 3.00


def _cost(tokens: int, model: str) -> float:
    rate = MODEL_RATES_PER_M.get(model, DEFAULT_RATE)
    return round((tokens / 1_000_000) * rate, 6)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Admin auth ─────────────────────────────────────────────────────────────────

def _make_admin_jwt() -> str:
    import time
    from jose import jwt as _jwt
    payload = {
        "sub":  "admin",
        "role": "admin",
        "iat":  int(time.time()),
        "exp":  int(time.time()) + 86400 * 30,
    }
    return _jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def _require_admin(authorization: str = Header(...)) -> None:
    from jose import jwt as _jwt, exceptions as _jose_exc
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = _jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
    except _jose_exc.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/auth")
async def admin_login(body: dict):
    if body.get("secret") != settings.admin_secret:
        raise HTTPException(status_code=401, detail="Invalid admin secret")
    return {"token": _make_admin_jwt(), "role": "admin"}


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def overview(
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    window_7d = (now - timedelta(days=7)).isoformat()
    window_14d = (now - timedelta(days=14)).isoformat()

    total_users = await db.users.count_documents({})
    total_gens  = await db.generation_log.count_documents({})
    gens_7d     = await db.generation_log.count_documents({"created_at": {"$gte": window_7d}})

    # Success rate
    pass_count = await db.generation_log.count_documents({"gate_result": "pass"})
    success_rate = round((pass_count / total_gens * 100) if total_gens else 0, 1)

    # Avg tokens + latency
    agg = await db.generation_log.aggregate([
        {"$group": {"_id": None, "avg_tokens": {"$avg": "$tokens_used"}, "avg_latency": {"$avg": "$latency_ms"}}}
    ]).to_list(1)
    avg_tokens   = round(agg[0]["avg_tokens"] or 0, 0) if agg else 0
    avg_latency  = round(agg[0]["avg_latency"] or 0, 0) if agg else 0

    # Model breakdown
    model_agg = await db.generation_log.aggregate([
        {"$group": {"_id": "$model_used", "count": {"$sum": 1}}}
    ]).to_list(20)
    model_breakdown = {
        ("haiku" if "haiku" in (r["_id"] or "") else "sonnet"): r["count"]
        for r in model_agg if r["_id"]
    }

    # Daily counts last 14 days
    daily_agg = await db.generation_log.aggregate([
        {"$match": {"created_at": {"$gte": window_14d}}},
        {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(14)
    daily_counts = [{"date": r["_id"], "count": r["count"]} for r in daily_agg]

    # Hook type distribution
    hook_agg = await db.content_dna.aggregate([
        {"$group": {"_id": "$hook_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)
    hook_dist = {r["_id"]: r["count"] for r in hook_agg if r["_id"]}

    # Top niches
    niche_agg = await db.users.aggregate([
        {"$group": {"_id": "$niche", "user_count": {"$sum": 1}}},
        {"$sort": {"user_count": -1}},
        {"$limit": 8},
    ]).to_list(8)
    top_niches = [{"niche": r["_id"] or "unknown", "user_count": r["user_count"]} for r in niche_agg]

    return {
        "total_users":            total_users,
        "total_generations":      total_gens,
        "generations_7d":         gens_7d,
        "success_rate_pct":       success_rate,
        "avg_tokens":             avg_tokens,
        "avg_latency_ms":         avg_latency,
        "model_breakdown":        model_breakdown,
        "daily_counts":           daily_counts,
        "hook_type_distribution": hook_dist,
        "top_niches":             top_niches,
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 100,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    raw = await db.users.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    result = []
    for u in raw:
        uid = str(u["_id"])
        total_gens = await db.generation_log.count_documents({"creator_id": uid})
        wins       = await db.content_dna.count_documents({"creator_id": uid, "is_winner": True})
        published  = await db.content_dna.count_documents({"creator_id": uid, "published": True})
        total_dna  = await db.content_dna.count_documents({"creator_id": uid})
        last_gen   = await db.generation_log.find_one({"creator_id": uid}, sort=[("created_at", -1)])
        result.append({
            "_id":          uid,
            "name":         u.get("name", ""),
            "email":        u.get("email", ""),
            "phone":        u.get("phone", ""),
            "niche":        u.get("niche", ""),
            "avatar_url":   u.get("avatar_url", ""),
            "created_at":   u.get("created_at", ""),
            "total_gens":   total_gens,
            "wins":         wins,
            "published":    published,
            "win_rate_pct": round((wins / total_dna * 100) if total_dna else 0, 1),
            "last_active":  last_gen["created_at"] if last_gen else None,
        })
    return result


@router.get("/users/{user_id}")
async def get_user_profile(
    user_id: str,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        user = await iam_service.get_user_by_id(db, user_id)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="User not found")

    total_gens  = await db.generation_log.count_documents({"creator_id": user_id})
    wins        = await db.content_dna.count_documents({"creator_id": user_id, "is_winner": True})
    published   = await db.content_dna.count_documents({"creator_id": user_id, "published": True})
    total_dna   = await db.content_dna.count_documents({"creator_id": user_id})

    # Token stats
    token_agg = await db.generation_log.aggregate([
        {"$match": {"creator_id": user_id}},
        {"$group": {"_id": None, "total_tokens": {"$sum": "$tokens_used"}, "avg_latency": {"$avg": "$latency_ms"}}},
    ]).to_list(1)
    total_tokens = token_agg[0]["total_tokens"] if token_agg else 0
    avg_latency  = round(token_agg[0]["avg_latency"] or 0, 0) if token_agg else 0

    # Hook distribution
    hook_agg = await db.content_dna.aggregate([
        {"$match": {"creator_id": user_id}},
        {"$group": {"_id": "$hook_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)
    hook_dist = {r["_id"]: r["count"] for r in hook_agg if r["_id"]}

    recent_dna = await db.content_dna.find(
        {"creator_id": user_id}, {"_id": 0, "embedding": 0}
    ).sort("created_at", -1).limit(30).to_list(30)

    recent_gens = await db.generation_log.find(
        {"creator_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)

    return {
        "user": user,
        "stats": {
            "total_generations": total_gens,
            "wins":              wins,
            "published":         published,
            "win_rate_pct":      round((wins / total_dna * 100) if total_dna else 0, 1),
            "publish_rate_pct":  round((published / total_dna * 100) if total_dna else 0, 1),
            "total_tokens":      total_tokens,
            "avg_latency_ms":    avg_latency,
        },
        "hook_distribution": hook_dist,
        "recent_dna":        recent_dna,
        "recent_generations": recent_gens,
    }


@router.put("/users/{user_id}/ai-settings")
async def update_ai_settings(
    user_id: str,
    body: dict,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    allowed = {"brand_voice", "target_audience", "spice_level", "niche", "interests", "bio", "competitors"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    try:
        return await iam_service.update_user(db, user_id, updates)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="User not found")


@router.post("/users/{user_id}/dna/{dna_id}/winner")
async def toggle_dna_winner(
    user_id: str,
    dna_id: str,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await db.content_dna.find_one({"id": dna_id, "creator_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="DNA entry not found")
    new_val = not doc.get("is_winner", False)
    await db.content_dna.update_one({"id": dna_id}, {"$set": {"is_winner": new_val}})
    return {"id": dna_id, "is_winner": new_val}


# ── Token Usage ───────────────────────────────────────────────────────────────

@router.get("/users/{user_id}/tokens")
async def user_token_usage(
    user_id: str,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    window_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    agg = await db.generation_log.aggregate([
        {"$match": {"creator_id": user_id}},
        {"$group": {
            "_id":          "$model_used",
            "calls":        {"$sum": 1},
            "total_tokens": {"$sum": "$tokens_used"},
        }},
    ]).to_list(10)

    model_breakdown: dict = {}
    total_tokens = 0
    total_calls  = 0
    total_cost   = 0.0
    for row in agg:
        model = row["_id"] or "unknown"
        short = "haiku" if "haiku" in model else "sonnet"
        model_breakdown[short] = {
            "calls":  row["calls"],
            "tokens": row["total_tokens"],
            "cost_usd": _cost(row["total_tokens"], model),
        }
        total_tokens += row["total_tokens"]
        total_calls  += row["calls"]
        total_cost   += _cost(row["total_tokens"], model)

    daily_agg = await db.generation_log.aggregate([
        {"$match": {"creator_id": user_id, "created_at": {"$gte": window_30d}}},
        {"$group": {
            "_id":   {"$substr": ["$created_at", 0, 10]},
            "tokens": {"$sum": "$tokens_used"},
            "calls":  {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]).to_list(30)
    daily = [{"date": r["_id"], "tokens": r["tokens"], "calls": r["calls"]} for r in daily_agg]

    return {
        "total_tokens":       total_tokens,
        "total_calls":        total_calls,
        "estimated_cost_usd": round(total_cost, 4),
        "model_breakdown":    model_breakdown,
        "daily":              daily,
    }


@router.get("/tokens")
async def all_token_usage(
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Aggregate token usage across ALL users."""
    window_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    agg = await db.generation_log.aggregate([
        {"$group": {
            "_id":          "$model_used",
            "calls":        {"$sum": 1},
            "total_tokens": {"$sum": "$tokens_used"},
        }},
    ]).to_list(10)

    total_tokens = sum(r["total_tokens"] for r in agg)
    total_calls  = sum(r["calls"] for r in agg)
    total_cost   = sum(_cost(r["total_tokens"], r["_id"] or "") for r in agg)

    daily_agg = await db.generation_log.aggregate([
        {"$match": {"created_at": {"$gte": window_30d}}},
        {"$group": {
            "_id":    {"$substr": ["$created_at", 0, 10]},
            "tokens": {"$sum": "$tokens_used"},
            "calls":  {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]).to_list(30)

    # Per-user breakdown (top 20 by token use)
    user_agg = await db.generation_log.aggregate([
        {"$group": {
            "_id":    "$creator_id",
            "calls":  {"$sum": 1},
            "tokens": {"$sum": "$tokens_used"},
        }},
        {"$sort": {"tokens": -1}},
        {"$limit": 20},
    ]).to_list(20)
    per_user = []
    for row in user_agg:
        uid = row["_id"]
        user_doc = await db.users.find_one({"id": uid}, {"name": 1, "email": 1, "phone": 1})
        per_user.append({
            "user_id": uid,
            "name":    user_doc.get("name", "—") if user_doc else "—",
            "email":   user_doc.get("email", user_doc.get("phone", "")) if user_doc else "",
            "calls":   row["calls"],
            "tokens":  row["tokens"],
            "cost_usd": round(_cost(row["tokens"], ""), 4),
        })

    return {
        "total_tokens":       total_tokens,
        "total_calls":        total_calls,
        "estimated_cost_usd": round(total_cost, 4),
        "daily":              [{"date": r["_id"], "tokens": r["tokens"], "calls": r["calls"]} for r in daily_agg],
        "per_user":           per_user,
    }


# ── Hook Library ──────────────────────────────────────────────────────────────

@router.get("/hooks")
async def list_hooks(
    creator_id: Optional[str] = None,
    niche: Optional[str] = None,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q: dict = {}
    if creator_id:
        q["creator_id"] = creator_id
    elif creator_id is None:
        pass  # return all (global + per-user)
    if niche:
        q["niche"] = niche

    hooks = await db.hook_library.find(q, {"_id": 0, "embedding": 0}).sort("usage_count", -1).to_list(500)

    # Annotate with win_rate from content_dna
    for h in hooks:
        usage = h.get("usage_count", 0)
        if usage > 0:
            wins = await db.content_dna.count_documents({
                "hook_type": h.get("hook_type"), "is_winner": True
            })
            h["win_rate_pct"] = round((wins / usage * 100), 1)
        else:
            h["win_rate_pct"] = 0.0

    return hooks


@router.post("/hooks")
async def create_hook(
    body: dict,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    import uuid
    required = {"hook_text", "hook_type", "niche"}
    if not required.issubset(body):
        raise HTTPException(status_code=400, detail=f"Required fields: {required}")
    doc = {
        "id":           str(uuid.uuid4()),
        "hook_text":    body["hook_text"],
        "hook_type":    body["hook_type"],
        "niche":        body["niche"],
        "platform":     body.get("platform", "instagram"),
        "source":       "manual",
        "creator_id":   body.get("creator_id"),   # None = global
        "usage_count":  0,
        "avg_engagement": float(body.get("avg_engagement", 0.5)),
        "is_active":    True,
        "embedding":    None,
        "created_at":   _now(),
    }
    await db.hook_library.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/hooks/{hook_id}")
async def update_hook(
    hook_id: str,
    body: dict,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    allowed = {"is_active", "avg_engagement", "hook_text", "niche", "hook_type"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields")
    res = await db.hook_library.update_one({"id": hook_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Hook not found")
    return {"ok": True, "updated": updates}


@router.delete("/hooks/{hook_id}")
async def delete_hook(
    hook_id: str,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    res = await db.hook_library.delete_one({"id": hook_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hook not found")
    return {"ok": True}


# ── Generation Log ─────────────────────────────────────────────────────────────

@router.get("/generations")
async def list_generations(
    skip: int = 0,
    limit: int = 50,
    creator_id: Optional[str] = None,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q = {"creator_id": creator_id} if creator_id else {}
    docs = await db.generation_log.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.generation_log.count_documents(q)
    return {"generations": docs, "total": total}
