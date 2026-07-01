from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend_mobile.database import get_db
from backend_mobile.modules.iam.router import _current_user_id
from backend_mobile.modules.studio import service as studio_service
from backend_mobile.modules.studio.schemas import CreateTemplateRequest, UpdateTemplateRequest
from backend_mobile.shared.exceptions import ForbiddenError, NotFoundError

router = APIRouter(prefix="/api/v1/templates", tags=["studio"])


@router.get("")
async def list_templates(
    kind: Optional[str] = Query(None),
    niche: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await studio_service.list_templates(db, user_id, kind, niche, scope, search, page, limit)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_template(
    req: CreateTemplateRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await studio_service.create_template(db, user_id, req)


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        return await studio_service.get_template(db, template_id, user_id)
    except NotFoundError as e:
        raise HTTPException(404, detail=e.detail)
    except ForbiddenError as e:
        raise HTTPException(403, detail=e.detail)


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    req: UpdateTemplateRequest,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        return await studio_service.update_template(db, template_id, user_id, req)
    except NotFoundError as e:
        raise HTTPException(404, detail=e.detail)
    except ForbiddenError as e:
        raise HTTPException(403, detail=e.detail)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        await studio_service.delete_template(db, template_id, user_id)
    except NotFoundError as e:
        raise HTTPException(404, detail=e.detail)
    except ForbiddenError as e:
        raise HTTPException(403, detail=e.detail)


@router.post("/{template_id}/clone", status_code=status.HTTP_201_CREATED)
async def clone_template(
    template_id: str,
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        return await studio_service.clone_template(db, template_id, user_id)
    except NotFoundError as e:
        raise HTTPException(404, detail=e.detail)
    except ForbiddenError as e:
        raise HTTPException(403, detail=e.detail)


@router.post("/seed")
async def seed_starters(
    user_id: str = Depends(_current_user_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    count = await studio_service.seed_starters(db)
    return {"seeded": count}
