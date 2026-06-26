"""Authentication endpoints: register, login, refresh, logout, logout-all."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_redis_dep, rate_limit
from app.core.exceptions import AppError
from app.core.security import decode_token
from app.models.user import User
from app.schemas.token import RefreshRequest, TokenPair
from app.schemas.user import UserCreate, UserLogin, UserRead
from app.services.auth import (
    authenticate_user,
    issue_token_pair,
    register_user,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("anon"))],
)
async def register(data: UserCreate, session: AsyncSession = Depends(get_db)) -> UserRead:
    user = await register_user(session, data)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair, dependencies=[Depends(rate_limit("anon"))])
async def login(
    data: UserLogin,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    user = await authenticate_user(session, data.email, data.password)
    return await issue_token_pair(redis, user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    data: RefreshRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    return await rotate_refresh_token(session, redis, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    data: RefreshRequest,
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Idempotent: an invalid/expired refresh token is treated as already logged out.
    try:
        payload = decode_token(data.refresh_token, expected_type="refresh")
    except AppError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if payload.sub == str(user.id):
        await revoke_refresh_token(redis, user.id, payload.jti)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await revoke_all_refresh_tokens(redis, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
