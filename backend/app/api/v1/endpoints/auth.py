"""Authentication endpoints: register, login, token lifecycle, and account recovery."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_redis_dep, rate_limit
from app.core.exceptions import AppError, EmailAlreadyVerifiedError
from app.core.security import decode_token
from app.models.user import User
from app.schemas.token import (
    ForgotPasswordRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
    TokenRequest,
)
from app.schemas.user import UserCreate, UserLogin, UserRead
from app.services.auth import (
    authenticate_user,
    confirm_email_change,
    initiate_password_reset,
    issue_token_pair,
    register_user,
    reset_password,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
    send_user_verification_email,
    verify_email,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("anon"))],
)
async def register(
    data: UserCreate,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await register_user(session, data)
    # Fire the verification email off the request path (best-effort inside the service).
    background.add_task(send_user_verification_email, user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair, dependencies=[Depends(rate_limit("anon"))])
async def login(
    data: UserLogin,
    request: Request,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    user = await authenticate_user(session, data.email, data.password)
    return await issue_token_pair(
        redis, user, user_agent=request.headers.get("user-agent")
    )


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


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email_endpoint(
    data: TokenRequest,
    session: AsyncSession = Depends(get_db),
) -> Response:
    await verify_email(session, data.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/resend-verification",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("auth"))],
)
async def resend_verification_endpoint(
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> Response:
    if user.email_verified:
        raise EmailAlreadyVerifiedError()
    background.add_task(send_user_verification_email, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("anon"))],
)
async def forgot_password(
    data: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Always 204, even for unknown emails, so account existence never leaks.
    await initiate_password_reset(session, redis, data.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("anon"))],
)
async def reset_password_endpoint(
    data: ResetPasswordRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await reset_password(session, redis, data.token, data.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/confirm-email-change", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_email_change_endpoint(
    data: TokenRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    user = await confirm_email_change(session, redis, data.token)
    # Changing the login identity invalidates existing sessions on all devices.
    await revoke_all_refresh_tokens(redis, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
