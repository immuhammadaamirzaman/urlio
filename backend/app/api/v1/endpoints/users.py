"""Current-user profile endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_redis_dep
from app.models.user import User
from app.schemas.token import SessionRead
from app.schemas.user import AccountDelete, EmailChangeRequest, UserRead, UserUpdate
from app.services.account_flows import request_email_change
from app.services.auth import list_sessions, revoke_refresh_token
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
    updated = await update_profile(session, redis, user, data)
    return UserRead.model_validate(updated)


@router.post("/me/email", status_code=status.HTTP_202_ACCEPTED)
async def change_my_email(
    data: EmailChangeRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> dict:
    """Start an email change; a confirmation link is sent to the new address."""
    await request_email_change(session, redis, user, data.new_email, data.password)
    return {"detail": "A confirmation link has been sent to the new address."}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    data: AccountDelete,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await delete_account(session, redis, user, data.password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/sessions", response_model=list[SessionRead])
async def my_sessions(
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> list[SessionRead]:
    return await list_sessions(redis, user.id)


@router.delete("/me/sessions/{jti}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_session(
    jti: str = Path(min_length=1, max_length=64),
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Idempotent: revoking an unknown/already-revoked jti is a no-op.
    await revoke_refresh_token(redis, user.id, jti)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
