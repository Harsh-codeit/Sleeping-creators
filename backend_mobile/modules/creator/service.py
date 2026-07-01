"""Creator module service — profile, strategy, onboarding, and context for Intelligence."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend_mobile.modules.creator.models import (
    CreatorProfile,
    CreatorStrategy,
    OnboardingState,
)
from backend_mobile.modules.creator.schemas import (
    CreatorContextResponse,
    CreatorProfileResponse,
    CreatorStrategyResponse,
    OnboardingStateResponse,
    UpdateCreatorProfileRequest,
    UpdateStrategyRequest,
)
from backend_mobile.shared.exceptions import NotFoundError

logger = logging.getLogger(__name__)


async def get_or_create_profile(user_id: str, db: AsyncSession) -> CreatorProfile:
    profile = await db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user_id))
    if not profile:
        profile = CreatorProfile(user_id=user_id)
        db.add(profile)
        strategy = CreatorStrategy(creator_id=user_id)
        db.add(strategy)
        db.add(OnboardingState(user_id=user_id))
        await db.commit()
        await db.refresh(profile)
    return profile


async def get_profile(user_id: str, db: AsyncSession) -> CreatorProfileResponse:
    profile = await get_or_create_profile(user_id, db)
    return CreatorProfileResponse.model_validate(profile)


async def update_profile(
    user_id: str,
    req: UpdateCreatorProfileRequest,
    db: AsyncSession,
) -> CreatorProfileResponse:
    profile = await get_or_create_profile(user_id, db)
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return CreatorProfileResponse.model_validate(profile)


async def get_strategy(user_id: str, db: AsyncSession) -> CreatorStrategyResponse:
    strategy = await db.scalar(select(CreatorStrategy).where(CreatorStrategy.creator_id == user_id))
    if not strategy:
        strategy = CreatorStrategy(creator_id=user_id)
        db.add(strategy)
        await db.commit()
        await db.refresh(strategy)
    return CreatorStrategyResponse.model_validate(strategy)


async def update_strategy(
    user_id: str,
    req: UpdateStrategyRequest,
    db: AsyncSession,
) -> CreatorStrategyResponse:
    strategy = await db.scalar(select(CreatorStrategy).where(CreatorStrategy.creator_id == user_id))
    if not strategy:
        strategy = CreatorStrategy(creator_id=user_id)
        db.add(strategy)
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(strategy, field, value)
    await db.commit()
    await db.refresh(strategy)
    return CreatorStrategyResponse.model_validate(strategy)


async def complete_onboarding_step(
    user_id: str,
    step: str,
    data: dict,
    db: AsyncSession,
) -> OnboardingStateResponse:
    state = await db.scalar(select(OnboardingState).where(OnboardingState.user_id == user_id))
    if not state:
        state = OnboardingState(user_id=user_id)
        db.add(state)

    if step not in state.completed_steps:
        state.completed_steps = state.completed_steps + [step]

    # Apply any profile / strategy data embedded in the step
    if data:
        profile = await get_or_create_profile(user_id, db)
        profile_fields = {
            "name", "niche", "industry", "brand_voice", "target_audience",
            "languages", "spice_level", "preferred_hook_styles", "cta_keywords",
        }
        strategy_fields = {"content_pillars", "posting_frequency", "topic_includes", "topic_excludes"}

        for k, v in data.items():
            if k in profile_fields:
                setattr(profile, k, v)

        strategy = await db.scalar(
            select(CreatorStrategy).where(CreatorStrategy.creator_id == user_id)
        )
        if strategy:
            for k, v in data.items():
                if k in strategy_fields:
                    setattr(strategy, k, v)

    # Advance step
    steps_order = ["profile", "niche", "brand_voice", "strategy", "social", "complete"]
    try:
        next_idx = steps_order.index(step) + 1
        state.current_step = steps_order[next_idx] if next_idx < len(steps_order) else "complete"
    except ValueError:
        state.current_step = "complete"

    if state.current_step == "complete" and not state.completed_at:
        state.completed_at = datetime.now(timezone.utc)
        # Mark user onboarding_complete
        from backend_mobile.modules.iam.models import User
        user = await db.scalar(select(User).where(User.id == user_id))
        if user:
            user.onboarding_complete = True

    await db.commit()
    await db.refresh(state)
    return OnboardingStateResponse.model_validate(state)


async def get_creator_context(user_id: str, db: AsyncSession) -> CreatorContextResponse:
    """Full context blob for the Intelligence module — single DB round-trip."""
    profile = await get_or_create_profile(user_id, db)
    strategy = await db.scalar(select(CreatorStrategy).where(CreatorStrategy.creator_id == user_id))

    pillars = strategy.content_pillars if strategy else []
    if isinstance(pillars, dict):
        pillars = list(pillars.values())

    return CreatorContextResponse(
        creator_id=profile.id,
        name=profile.name,
        niche=profile.niche,
        industry=profile.industry,
        brand_voice=profile.brand_voice,
        target_audience=profile.target_audience,
        languages=profile.languages or ["en"],
        spice_level=profile.spice_level,
        preferred_hook_styles=profile.preferred_hook_styles or [],
        cta_keywords=profile.cta_keywords or [],
        content_pillars=pillars,
        topic_excludes=strategy.topic_excludes if strategy else [],
        posting_frequency=strategy.posting_frequency if strategy else 5,
    )
