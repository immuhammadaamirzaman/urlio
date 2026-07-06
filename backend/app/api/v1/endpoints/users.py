"""Current-user profile, email change, session management, and account deletion."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_redis_dep
from app.models.user import User
from app.schemas.user import (
    EmailChangeRequest,
    PasswordConfirm,
    SessionRead,
    UserRead,
    UserUpdate,
)
from app.services.auth import (
    list_sessions,
    request_email_change,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
)
from app.services.users import delete_account, update_profile

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
async def read_me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> UserRead:
    updated, password_changed = await update_profile(session, user, data)
    if password_changed:
        # Force re-login everywhere after a password change.
        await revoke_all_refresh_tokens(redis, updated.id)
    return UserRead.model_validate(updated)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    data: PasswordConfirm,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Soft delete: the account is disabled (not erased). Revoke sessions so any live tokens
    # stop working immediately.
    await delete_account(session, redis, user, data.password)
    await revoke_all_refresh_tokens(redis, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/email", status_code=status.HTTP_204_NO_CONTENT)
async def change_email(
    data: EmailChangeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Sends a confirmation link to the new address; the change applies on confirmation.
    await request_email_change(session, redis, user, data.new_email, data.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/sessions", response_model=list[SessionRead])
async def list_my_sessions(
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> list[SessionRead]:
    return await list_sessions(redis, user.id)


@router.delete("/me/sessions/{jti}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_session(
    jti: str,
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Idempotent: revoking an unknown/already-gone jti still returns 204.
    await revoke_refresh_token(redis, user.id, jti)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
