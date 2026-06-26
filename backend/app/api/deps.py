"""FastAPI dependencies: DB/Redis access, auth, pagination, and rate limiting."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import get_redis
from app.core.config import settings
from app.core.exceptions import AppError, RateLimitExceededError
from app.core.ratelimit import check_rate_limit
from app.db.session import get_session
from app.models.user import User
from app.schemas.common import PaginationParams
from app.services.auth import resolve_current_user

bearer_scheme = HTTPBearer(auto_error=True)
optional_bearer_scheme = HTTPBearer(auto_error=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield a database session (delegates to the engine-bound session factory)."""
    async for session in get_session():
        yield session


async def get_redis_dep() -> Redis:
    """Return the shared Redis client (overridden in tests)."""
    return get_redis()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user; raises 401 if the token is missing/invalid."""
    return await resolve_current_user(session, credentials.credentials)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    session: AsyncSession = Depends(get_db),
) -> User | None:
    """Resolve the user if a valid token is present; otherwise treat as anonymous."""
    if credentials is None:
        return None
    try:
        return await resolve_current_user(session, credentials.credentials)
    except AppError:
        return None


def get_pagination(
    limit: int = Query(default=settings.DEFAULT_PAGE_SIZE, ge=1, le=settings.MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset, cursor=cursor)


def client_ip(request: Request) -> str:
    """Best-effort client IP (first X-Forwarded-For hop, else the socket peer)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _apply_rate_limit(
    request: Request,
    redis: Redis,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    if not settings.RATE_LIMIT_ENABLED:
        return
    result = await check_rate_limit(
        redis,
        scope=scope,
        identifier=identifier,
        limit=limit,
        window_seconds=window_seconds,
    )
    request.state.rate_limit = result
    if not result.allowed:
        raise RateLimitExceededError(retry_after=result.retry_after)


def rate_limit(scope: str):
    """Return a rate-limit dependency for the given scope.

    ``"redirect"`` always limits anonymously by IP (no auth on the hot path). Other scopes
    limit by user id when authenticated, otherwise by client IP.
    """
    if scope == "redirect":

        async def _redirect_dep(
            request: Request, redis: Redis = Depends(get_redis_dep)
        ) -> None:
            await _apply_rate_limit(
                request,
                redis,
                scope="redirect",
                identifier=client_ip(request),
                limit=settings.RATE_LIMIT_REDIRECT_ANON_PER_MINUTE,
                window_seconds=settings.RATE_LIMIT_REDIRECT_WINDOW_SECONDS,
            )

        return _redirect_dep

    async def _dep(
        request: Request,
        redis: Redis = Depends(get_redis_dep),
        user: User | None = Depends(get_optional_user),
    ) -> None:
        if user is not None:
            await _apply_rate_limit(
                request,
                redis,
                scope="auth",
                identifier=str(user.id),
                limit=settings.RATE_LIMIT_AUTH_PER_MINUTE,
                window_seconds=settings.RATE_LIMIT_AUTH_WINDOW_SECONDS,
            )
        else:
            await _apply_rate_limit(
                request,
                redis,
                scope="anon",
                identifier=client_ip(request),
                limit=settings.RATE_LIMIT_ANON_PER_MINUTE,
                window_seconds=settings.RATE_LIMIT_ANON_WINDOW_SECONDS,
            )

    return _dep
