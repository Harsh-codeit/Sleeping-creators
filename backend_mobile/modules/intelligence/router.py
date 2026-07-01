"""Intelligence module router — /api/v1/generate/ and /api/v1/plans/"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend_mobile.modules.intelligence.schemas import (
    CarouselGenerationRequest,
    CarouselGenerationResponse,
    ContentPlanRequest,
    ContentPlanResponse,
    TextPostGenerationRequest,
    TextPostGenerationResponse,
)
from backend_mobile.modules.intelligence.service import (
    IntelligenceService,
    get_intelligence_service,
)
from backend_mobile.modules.iam.router import _current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["intelligence"])


# ── Dependency stubs — replace with shared/dependencies.py wires ──────────────

async def _get_db() -> AsyncSession:  # type: ignore[return]
    """Replaced by shared.dependencies.get_db in the mounted app."""
    raise NotImplementedError("DB dependency not wired")


async def _get_redis():
    """Replaced by shared.dependencies.get_redis in the mounted app."""
    raise NotImplementedError("Redis dependency not wired")


def _get_service() -> IntelligenceService:
    return get_intelligence_service()


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/generate/carousel",
    response_model=CarouselGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a carousel post",
)
async def generate_carousel(
    req: CarouselGenerationRequest,
    db: AsyncSession = Depends(_get_db),
    redis=Depends(_get_redis),
    service: IntelligenceService = Depends(_get_service),
    user_id: str = Depends(_current_user_id),
) -> CarouselGenerationResponse:
    req.creator_id = req.creator_id or user_id
    try:
        return await service.generate_carousel(req, db, redis)
    except Exception as exc:
        logger.exception("Carousel generation failed for creator=%s", req.creator_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {exc}",
        ) from exc


@router.post(
    "/generate/text",
    response_model=TextPostGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a text / caption post",
)
async def generate_text_post(
    req: TextPostGenerationRequest,
    db: AsyncSession = Depends(_get_db),
    redis=Depends(_get_redis),
    service: IntelligenceService = Depends(_get_service),
) -> TextPostGenerationResponse:
    try:
        return await service.generate_text_post(req, db, redis)
    except Exception as exc:
        logger.exception("Text post generation failed for creator=%s", req.creator_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {exc}",
        ) from exc


@router.post(
    "/plans",
    response_model=ContentPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a 7-day content plan",
)
async def generate_content_plan(
    req: ContentPlanRequest,
    db: AsyncSession = Depends(_get_db),
    redis=Depends(_get_redis),
    service: IntelligenceService = Depends(_get_service),
) -> ContentPlanResponse:
    try:
        return await service.generate_content_plan(req, db, redis)
    except Exception as exc:
        logger.exception("Content plan generation failed for creator=%s", req.creator_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Plan generation failed: {exc}",
        ) from exc


@router.get(
    "/plans/{plan_id}",
    response_model=ContentPlanResponse,
    summary="Fetch a saved content plan",
)
async def get_content_plan(
    plan_id: str,
    db: AsyncSession = Depends(_get_db),
) -> ContentPlanResponse:
    from sqlalchemy import select
    from backend_mobile.modules.intelligence.models import ContentPlan
    from backend_mobile.modules.intelligence.schemas import ContentPlanDay

    row = await db.scalar(select(ContentPlan).where(ContentPlan.id == plan_id))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    days = [ContentPlanDay(**d) for d in row.plan_json.get("days", [])]
    return ContentPlanResponse(
        plan_id=row.id,
        creator_id=row.creator_id,
        week_start=row.week_start,
        days=days,
        status=row.status,
        created_at=row.created_at,
    )
