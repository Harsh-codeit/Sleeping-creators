"""FastAPI application entry point for the Sleeping Creators mobile backend."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend_mobile.config import settings
from backend_mobile import database

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ── Redis singleton ────────────────────────────────────────────────────────────

_redis_pool: aioredis.Redis = None


def get_redis():
    return _redis_pool  # None when Redis is unavailable; callers must handle


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _redis_pool

    await database.init_db()
    logger.info("MongoDB connected → db=%s", settings.db_name)

    try:
        from backend_mobile.modules.intelligence.seed_hooks import seed_hook_library
        await seed_hook_library(database.db)
    except Exception as _seed_exc:
        logger.warning("Hook library seed failed (non-fatal): %s", _seed_exc)

    try:
        _redis_pool = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        await _redis_pool.ping()
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning("Redis unavailable — caching disabled: %s", exc)
        _redis_pool = None

    yield

    await database.close_db()
    if _redis_pool:
        await _redis_pool.aclose()
    logger.info("Shutdown complete")


# ── App factory ────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="Sleeping Creators — Mobile API",
        version="0.2.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ─────────────────────────────────────────────────────────────────
    from backend_mobile.modules.iam.router import router as iam_router
    from backend_mobile.modules.iam.compat_router import router as compat_router

    from backend_mobile.modules.studio.router import router as studio_router
    from backend_mobile.modules.studio.compat_router import router as studio_compat_router

    from backend_mobile.modules.intelligence.router import router as intel_router
    from backend_mobile.modules.intelligence.router import _get_db as intel_get_db, _get_redis as intel_get_redis

    from backend_mobile.modules.creator.router import router as creator_router
    from backend_mobile.modules.creator.router import _get_db as creator_get_db

    # Dependency overrides for modules that still use stub pattern
    app.dependency_overrides[intel_get_db] = database.get_db
    app.dependency_overrides[intel_get_redis] = get_redis
    app.dependency_overrides[creator_get_db] = database.get_db

    from backend_mobile.modules.posts.router import router as posts_router
    from backend_mobile.modules.posts.carousel_router import router as carousel_router
    from backend_mobile.modules.posts.video_router import router as video_router
    from backend_mobile.modules.publishing.router import router as publishing_router

    # ── Register routers ────────────────────────────────────────────────────────
    app.include_router(compat_router)         # /api/auth/* /api/me
    app.include_router(studio_compat_router)  # /api/templates/*
    app.include_router(iam_router)            # /api/v1/auth/* /api/v1/users/me
    app.include_router(studio_router)         # /api/v1/templates/*
    app.include_router(intel_router)          # /api/v1/generate/* /api/v1/plans
    app.include_router(creator_router)        # /api/v1/creator/*
    app.include_router(posts_router)          # /api/posts/* /api/calendar
    app.include_router(carousel_router)       # /api/carousel/generate /api/carousels
    app.include_router(video_router)          # /api/videos/* /api/shotstack-templates
    app.include_router(publishing_router)     # /api/bundle/*

    # ── Health ──────────────────────────────────────────────────────────────────
    @app.get("/health", tags=["ops"])
    async def health():
        return {"status": "ok", "version": app.version, "db": settings.db_name}

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("Unhandled: %s", exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_mobile.main:app", host="0.0.0.0", port=8001, reload=True)
