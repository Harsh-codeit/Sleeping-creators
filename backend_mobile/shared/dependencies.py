"""Shared FastAPI dependencies — injected into every module router."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from backend_mobile.database import AsyncSessionFactory
from backend_mobile.modules.iam import service as iam_service
from backend_mobile.modules.iam.models import User
from backend_mobile.shared.exceptions import UnauthorizedError


async def get_db():
    async with AsyncSessionFactory() as session:
        yield session


def get_redis():
    from backend_mobile.main import get_redis as _get_redis
    return _get_redis()


async def get_current_user_id(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = iam_service.decode_access_token(token)
        return payload["sub"]
    except UnauthorizedError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.detail) from exc


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db=Depends(get_db),
) -> User:
    return await iam_service.get_user_by_id(user_id, db)
