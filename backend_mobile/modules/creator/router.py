"""Creator profile router — /api/v1/creator/"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend_mobile.modules.creator import service as creator_service
from backend_mobile.modules.creator.schemas import (
    CreatorContextResponse,
    CreatorProfileResponse,
    CreatorStrategyResponse,
    OnboardingStateResponse,
    OnboardingStepRequest,
    UpdateCreatorProfileRequest,
    UpdateStrategyRequest,
)
from backend_mobile.modules.iam.router import _current_user_id

router = APIRouter(prefix="/api/v1/creator", tags=["creator"])


async def _get_db():  # type: ignore[return]
    raise NotImplementedError


@router.get("/me", response_model=CreatorProfileResponse)
async def get_my_profile(
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> CreatorProfileResponse:
    return await creator_service.get_profile(user_id, db)


@router.patch("/me", response_model=CreatorProfileResponse)
async def update_my_profile(
    req: UpdateCreatorProfileRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> CreatorProfileResponse:
    return await creator_service.update_profile(user_id, req, db)


@router.get("/strategy", response_model=CreatorStrategyResponse)
async def get_strategy(
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> CreatorStrategyResponse:
    return await creator_service.get_strategy(user_id, db)


@router.patch("/strategy", response_model=CreatorStrategyResponse)
async def update_strategy(
    req: UpdateStrategyRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> CreatorStrategyResponse:
    return await creator_service.update_strategy(user_id, req, db)


@router.post("/onboarding/step", response_model=OnboardingStateResponse)
async def complete_step(
    req: OnboardingStepRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> OnboardingStateResponse:
    return await creator_service.complete_onboarding_step(user_id, req.step, req.data, db)


@router.get("/context", response_model=CreatorContextResponse)
async def get_context(
    user_id: str = Depends(_current_user_id),
    db: AsyncSession = Depends(_get_db),
) -> CreatorContextResponse:
    """Full creator context consumed by the Intelligence module."""
    return await creator_service.get_creator_context(user_id, db)
