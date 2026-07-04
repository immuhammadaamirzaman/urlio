"""Authentication endpoints: register, login, refresh, logout, logout-all."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_ip, get_current_user, get_db, get_redis_dep, rate_limit
from app.core.exceptions import AppError
from app.core.security import decode_token, hash_ip
from app.models.user import User
from app.schemas.token import RefreshRequest, TokenPair
from app.schemas.user import (
    ConfirmEmailChangeRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserCreate,
    UserLogin,
    UserRead,
    VerifyEmailRequest,
)
from app.services.account_flows import (
    confirm_email_change,
    request_password_reset,
    reset_password,
    send_verification_email,
    verify_email,
)
from app.services.auth import (
    authenticate_user,
    issue_token_pair,
    register_user,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_meta(request: Request) -> dict[str, str | None]:
    """Device metadata recorded on the session (shown in the sessions list)."""
    return {
        "user_agent": request.headers.get("user-agent"),
        "ip_hash": hash_ip(client_ip(request)),
    }


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("anon"))],
)
async def register(
    data: UserCreate,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> UserRead:
    user = await register_user(session, data)
    # Best-effort: a mail outage must not fail the registration itself.
    await send_verification_email(redis, user)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair, dependencies=[Depends(rate_limit("anon"))])
async def login(
    data: UserLogin,
    request: Request,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    user = await authenticate_user(session, data.email, data.password)
    return await issue_token_pair(redis, user, **_session_meta(request))


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    data: RefreshRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> TokenPair:
    return await rotate_refresh_token(
        session, redis, data.refresh_token, **_session_meta(request)
    )


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


@router.post(
    "/forgot-password",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("anon"))],
)
async def forgot_password(
    data: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> dict:
    # Identical response whether or not the account exists (no enumeration).
    await request_password_reset(session, redis, data.email)
    return {"detail": "If that account exists, a reset link has been emailed."}


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


@router.post(
    "/verify-email",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("anon"))],
)
async def verify_email_endpoint(
    data: VerifyEmailRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await verify_email(session, redis, data.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis_dep),
) -> dict:
    await send_verification_email(redis, user)
    return {"detail": "If the address is unverified, a new link has been emailed."}


@router.post(
    "/confirm-email-change",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("anon"))],
)
async def confirm_email_change_endpoint(
    data: ConfirmEmailChangeRequest,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await confirm_email_change(session, redis, data.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
