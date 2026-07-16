"""Internal admin dashboard API — protected by ADMIN_SECRET."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from bson import ObjectId
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
    window_7d  = (now - timedelta(days=7)).isoformat()
    window_14d = (now - timedelta(days=14)).isoformat()

    # All 9 independent queries run in parallel — previously sequential
    (
        total_users,
        total_gens,
        gens_7d,
        pass_count,
        avg_agg,
        model_agg,
        daily_agg,
        hook_agg,
        niche_agg,
    ) = await asyncio.gather(
        db.users.count_documents({}),
        db.generation_log.count_documents({}),
        db.generation_log.count_documents({"created_at": {"$gte": window_7d}}),
        db.generation_log.count_documents({"gate_result": "pass"}),
        db.generation_log.aggregate([
            {"$group": {"_id": None, "avg_tokens": {"$avg": "$tokens_used"}, "avg_latency": {"$avg": "$latency_ms"}}}
        ]).to_list(1),
        db.generation_log.aggregate([
            {"$group": {"_id": "$model_used", "count": {"$sum": 1}}}
        ]).to_list(20),
        db.generation_log.aggregate([
            {"$match": {"created_at": {"$gte": window_14d}}},
            {"$group": {"_id": {"$substr": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]).to_list(14),
        db.content_dna.aggregate([
            {"$group": {"_id": "$hook_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        db.users.aggregate([
            {"$group": {"_id": "$niche", "user_count": {"$sum": 1}}},
            {"$sort": {"user_count": -1}},
            {"$limit": 8},
        ]).to_list(8),
    )

    success_rate = round((pass_count / total_gens * 100) if total_gens else 0, 1)
    avg_tokens   = round(avg_agg[0]["avg_tokens"] or 0, 0) if avg_agg else 0
    avg_latency  = round(avg_agg[0]["avg_latency"] or 0, 0) if avg_agg else 0
    model_breakdown = {
        ("haiku" if "haiku" in (r["_id"] or "") else "sonnet"): r["count"]
        for r in model_agg if r["_id"]
    }

    return {
        "total_users":            total_users,
        "total_generations":      total_gens,
        "generations_7d":         gens_7d,
        "success_rate_pct":       success_rate,
        "avg_tokens":             avg_tokens,
        "avg_latency_ms":         avg_latency,
        "model_breakdown":        model_breakdown,
        "daily_counts":           [{"date": r["_id"], "count": r["count"]} for r in daily_agg],
        "hook_type_distribution": {r["_id"]: r["count"] for r in hook_agg if r["_id"]},
        "top_niches":             [{"niche": r["_id"] or "unknown", "user_count": r["user_count"]} for r in niche_agg],
    }


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 100,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    # Fetch the page of users first
    raw = await db.users.find({}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    if not raw:
        return []

    user_ids = [str(u["_id"]) for u in raw]

    # Two batch aggregations instead of 5 × N individual queries
    gen_stats, dna_stats = await asyncio.gather(
        db.generation_log.aggregate([
            {"$match": {"creator_id": {"$in": user_ids}}},
            {"$group": {
                "_id":       "$creator_id",
                "total":     {"$sum": 1},
                "last_date": {"$max": "$created_at"},
            }},
        ]).to_list(len(user_ids)),
        db.content_dna.aggregate([
            {"$match": {"creator_id": {"$in": user_ids}}},
            {"$group": {
                "_id":       "$creator_id",
                "total":     {"$sum": 1},
                "wins":      {"$sum": {"$cond": [{"$eq": ["$is_winner", True]}, 1, 0]}},
                "published": {"$sum": {"$cond": [{"$eq": ["$published", True]}, 1, 0]}},
            }},
        ]).to_list(len(user_ids)),
    )

    gen_map = {r["_id"]: r for r in gen_stats}
    dna_map = {r["_id"]: r for r in dna_stats}

    result = []
    for u in raw:
        uid = str(u["_id"])
        g = gen_map.get(uid, {})
        d = dna_map.get(uid, {})
        total_dna = d.get("total", 0)
        wins      = d.get("wins", 0)
        result.append({
            "_id":          uid,
            "name":         u.get("name", ""),
            "email":        u.get("email", ""),
            "phone":        u.get("phone", ""),
            "niche":        u.get("niche", ""),
            "avatar_url":   u.get("avatar_url", ""),
            "created_at":   u.get("created_at", ""),
            "total_gens":   g.get("total", 0),
            "wins":         wins,
            "published":    d.get("published", 0),
            "win_rate_pct": round((wins / total_dna * 100) if total_dna else 0, 1),
            "last_active":  g.get("last_date"),
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

    # 4 counts + 2 aggregations + 2 list fetches — all in parallel
    (
        total_gens,
        total_dna,
        wins,
        published,
        token_agg,
        hook_agg,
        recent_dna,
        recent_gens,
    ) = await asyncio.gather(
        db.generation_log.count_documents({"creator_id": user_id}),
        db.content_dna.count_documents({"creator_id": user_id}),
        db.content_dna.count_documents({"creator_id": user_id, "is_winner": True}),
        db.content_dna.count_documents({"creator_id": user_id, "published": True}),
        db.generation_log.aggregate([
            {"$match": {"creator_id": user_id}},
            {"$group": {"_id": None, "total_tokens": {"$sum": "$tokens_used"}, "avg_latency": {"$avg": "$latency_ms"}}},
        ]).to_list(1),
        db.content_dna.aggregate([
            {"$match": {"creator_id": user_id}},
            {"$group": {"_id": "$hook_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        db.content_dna.find(
            {"creator_id": user_id}, {"_id": 0, "embedding": 0}
        ).sort("created_at", -1).limit(30).to_list(30),
        db.generation_log.find(
            {"creator_id": user_id}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20),
    )

    total_tokens = token_agg[0]["total_tokens"] if token_agg else 0
    avg_latency  = round(token_agg[0]["avg_latency"] or 0, 0) if token_agg else 0

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
        "hook_distribution": {r["_id"]: r["count"] for r in hook_agg if r["_id"]},
        "recent_dna":         recent_dna,
        "recent_generations": recent_gens,
    }


@router.put("/users/{user_id}/ai-settings")
async def update_ai_settings(
    user_id: str,
    body: dict,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    allowed = {
        "brand_voice", "target_audience", "spice_level", "niche", "interests", "bio", "competitors",
        "profile_name", "whatsapp_number", "city_country",
        "instagram_username", "instagram_profile_url",
        "website_url", "linkedin_url", "youtube_url", "twitter_url",
        "business_description", "niche_statement",
        "audience_age_min", "audience_age_max",
        "audience_emotional_states", "has_case_studies",
        "topics_love", "solutions_provided", "unique_selling_points", "faqs",
        "content_language", "content_dislikes", "topics_to_avoid", "underserved_topics",
        "primary_goal", "content_cta", "landing_page_url",
    }
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

    # Both aggregations run in parallel
    agg, daily_agg = await asyncio.gather(
        db.generation_log.aggregate([
            {"$match": {"creator_id": user_id}},
            {"$group": {
                "_id":          "$model_used",
                "calls":        {"$sum": 1},
                "total_tokens": {"$sum": "$tokens_used"},
            }},
        ]).to_list(10),
        db.generation_log.aggregate([
            {"$match": {"creator_id": user_id, "created_at": {"$gte": window_30d}}},
            {"$group": {
                "_id":    {"$substr": ["$created_at", 0, 10]},
                "tokens": {"$sum": "$tokens_used"},
                "calls":  {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]).to_list(30),
    )

    model_breakdown: dict = {}
    total_tokens = 0
    total_calls  = 0
    total_cost   = 0.0
    for row in agg:
        model = row["_id"] or "unknown"
        short = "haiku" if "haiku" in model else "sonnet"
        model_breakdown[short] = {
            "calls":    row["calls"],
            "tokens":   row["total_tokens"],
            "cost_usd": _cost(row["total_tokens"], model),
        }
        total_tokens += row["total_tokens"]
        total_calls  += row["calls"]
        total_cost   += _cost(row["total_tokens"], model)

    return {
        "total_tokens":       total_tokens,
        "total_calls":        total_calls,
        "estimated_cost_usd": round(total_cost, 4),
        "model_breakdown":    model_breakdown,
        "daily":              [{"date": r["_id"], "tokens": r["tokens"], "calls": r["calls"]} for r in daily_agg],
    }


@router.get("/tokens")
async def all_token_usage(
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Aggregate token usage across ALL users."""
    window_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    # Model summary + daily breakdown + per-user breakdown — all parallel
    agg, daily_agg, user_agg = await asyncio.gather(
        db.generation_log.aggregate([
            {"$group": {
                "_id":          "$model_used",
                "calls":        {"$sum": 1},
                "total_tokens": {"$sum": "$tokens_used"},
            }},
        ]).to_list(10),
        db.generation_log.aggregate([
            {"$match": {"created_at": {"$gte": window_30d}}},
            {"$group": {
                "_id":    {"$substr": ["$created_at", 0, 10]},
                "tokens": {"$sum": "$tokens_used"},
                "calls":  {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]).to_list(30),
        db.generation_log.aggregate([
            {"$group": {
                "_id":    "$creator_id",
                "calls":  {"$sum": 1},
                "tokens": {"$sum": "$tokens_used"},
            }},
            {"$sort": {"tokens": -1}},
            {"$limit": 20},
        ]).to_list(20),
    )

    total_tokens = sum(r["total_tokens"] for r in agg)
    total_calls  = sum(r["calls"] for r in agg)
    total_cost   = sum(_cost(r["total_tokens"], r["_id"] or "") for r in agg)

    # Bulk-fetch user docs for the top-20 in one query (fix: use _id not "id")
    top_uids = [row["_id"] for row in user_agg if row["_id"]]
    object_ids = []
    for uid in top_uids:
        try:
            object_ids.append(ObjectId(uid))
        except Exception:
            pass

    user_docs = await db.users.find(
        {"_id": {"$in": object_ids}},
        {"name": 1, "email": 1, "phone": 1},
    ).to_list(20)
    user_map = {str(u["_id"]): u for u in user_docs}

    per_user = []
    for row in user_agg:
        uid = row["_id"] or ""
        u = user_map.get(uid, {})
        per_user.append({
            "user_id":  uid,
            "name":     u.get("name", "—"),
            "email":    u.get("email") or u.get("phone", ""),
            "calls":    row["calls"],
            "tokens":   row["tokens"],
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
    if niche:
        q["niche"] = niche

    # Hooks + win-rate aggregation run in parallel (replaces per-hook loop)
    hooks, wins_agg = await asyncio.gather(
        db.hook_library.find(q, {"_id": 0, "embedding": 0}).sort("usage_count", -1).to_list(500),
        db.content_dna.aggregate([
            {"$match": {"is_winner": True}},
            {"$group": {"_id": "$hook_type", "wins": {"$sum": 1}}},
        ]).to_list(50),
    )

    wins_by_hook_type = {r["_id"]: r["wins"] for r in wins_agg if r["_id"]}

    for h in hooks:
        usage = h.get("usage_count", 0)
        wins  = wins_by_hook_type.get(h.get("hook_type"), 0)
        h["win_rate_pct"] = round((wins / usage * 100), 1) if usage > 0 else 0.0

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
        "id":             str(uuid.uuid4()),
        "hook_text":      body["hook_text"],
        "hook_type":      body["hook_type"],
        "niche":          body["niche"],
        "platform":       body.get("platform", "instagram"),
        "source":         "manual",
        "creator_id":     body.get("creator_id"),
        "usage_count":    0,
        "avg_engagement": float(body.get("avg_engagement", 0.5)),
        "is_active":      True,
        "embedding":      None,
        "created_at":     _now(),
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
    docs, total = await asyncio.gather(
        db.generation_log.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit),
        db.generation_log.count_documents(q),
    )
    return {"generations": docs, "total": total}


# ── Performance Library ────────────────────────────────────────────────────────

@router.post("/performance-library/ingest")
async def ingest_performance_library(
    body: dict,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Start a background ingestion job from a public Google Drive folder URL."""
    import asyncio as _aio
    from backend_mobile.modules.intelligence import ingestion_jobs, performance_ingestor
    from backend_mobile.modules.intelligence.service import get_intelligence_service

    drive_url = (body.get("drive_folder_url") or "").strip()
    if not drive_url:
        raise HTTPException(400, "drive_folder_url is required")

    source_label = (body.get("source_label") or "performance_dataset_v1").strip()
    job_id = await ingestion_jobs.create_job(db, source="google_drive", source_url=drive_url)
    svc = get_intelligence_service()

    async def _run():
        try:
            await performance_ingestor.ingest_from_drive_folder(
                folder_url=drive_url,
                job_id=job_id,
                db=db,
                anthropic_client=svc._anthropic,
                source_label=source_label,
            )
        except Exception as exc:
            logger.error("Ingestion job %s crashed: %s", job_id, exc)
            try:
                await ingestion_jobs.update_job(db, job_id, status="failed", finished=True)
            except Exception:
                pass

    _aio.create_task(_run())
    return {"job_id": job_id, "status": "started"}


@router.get("/performance-library/jobs")
async def list_ingestion_jobs(
    limit: int = 10,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    from backend_mobile.modules.intelligence import ingestion_jobs
    jobs = await ingestion_jobs.list_jobs(db, limit=limit)
    return {"jobs": jobs}


@router.get("/performance-library/stats")
async def performance_library_stats(
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Aggregate counts by niche, hook_type, and format — all in parallel."""
    total, niche_agg, hook_agg, format_agg, top_by_engagement = await asyncio.gather(
        db.performance_library.count_documents({}),
        db.performance_library.aggregate([
            {"$unwind": "$niches"},
            {"$group": {"_id": "$niches", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(50),
        db.performance_library.aggregate([
            {"$group": {"_id": "$hook_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        db.performance_library.aggregate([
            {"$group": {"_id": "$format", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        db.performance_library.find(
            {},
            {"_id": 0, "headline_text": 1, "niches": 1, "hook_type": 1, "engagement_score": 1, "likes_count": 1},
        ).sort("engagement_score", -1).limit(5).to_list(5),
    )

    return {
        "total":              total,
        "by_niche":           {r["_id"]: r["count"] for r in niche_agg if r["_id"]},
        "by_hook_type":       {r["_id"]: r["count"] for r in hook_agg if r["_id"]},
        "by_format":          {r["_id"]: r["count"] for r in format_agg if r["_id"]},
        "top_by_engagement":  top_by_engagement,
    }


@router.delete("/performance-library/{source_label}")
async def clear_performance_library_source(
    source_label: str,
    _: None = Depends(_require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    result = await db.performance_library.delete_many({"source": source_label})
    return {"deleted": result.deleted_count, "source": source_label}
