"""Public redirect endpoints — the latency-critical hot path.

``GET /{code}`` resolves through Redis (O(1)) and fires click recording off the request
via ``BackgroundTasks``. ``POST /{code}`` handles password-protected links: a correct
password mints a short-lived signed grant cookie that ``GET`` then accepts.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import RedirectResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_ip, get_db, get_redis_dep, rate_limit
from app.core.config import settings
from app.core.exceptions import (
    InvalidLinkPasswordError,
    LinkExpiredError,
    LinkInactiveError,
    LinkNotFoundError,
    LinkPasswordRequiredError,
)
from app.core.security import (
    create_link_password_grant,
    hash_ip,
    verify_link_password_grant,
)
from app.schemas.link import PasswordSubmit
from app.services.analytics import record_click
from app.services.links import (
    get_link_by_code,
    is_expired,
    resolve_for_redirect,
    verify_link_password,
)
from app.services.shortcode import is_reserved

redirect_router = APIRouter(tags=["redirect"])


def _grant_token(request: Request, code: str) -> str | None:
    """Read a link-password grant from the cookie or the X-Link-Grant header."""
    return request.cookies.get(f"linkpw_{code}") or request.headers.get("x-link-grant")


def _country_from(request: Request) -> str | None:
    """Visitor country from the configured proxy/CDN header (None when disabled)."""
    if not settings.COUNTRY_HEADER:
        return None
    value = (request.headers.get(settings.COUNTRY_HEADER) or "").strip().upper()
    # "XX" is the common "unknown" sentinel (e.g. Cloudflare); store as no data.
    if len(value) == 2 and value.isalpha() and value != "XX":
        return value
    return None


def _schedule_click(
    background: BackgroundTasks, request: Request, redis: Redis, link_id
) -> None:
    background.add_task(
        record_click,
        redis,
        link_id=link_id,
        referrer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
        ip_hash=hash_ip(client_ip(request)),
        country=_country_from(request),
    )


def _expired(expires_at: datetime | None, now: datetime) -> bool:
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at < now


@redirect_router.get(
    "/{code}",
    include_in_schema=False,
    dependencies=[Depends(rate_limit("redirect"))],
)
async def redirect(
    code: str,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> RedirectResponse:
    if is_reserved(code):
        raise LinkNotFoundError()

    resolve = await resolve_for_redirect(session, redis, code)
    if not resolve.is_active:
        raise LinkInactiveError()
    if is_expired(resolve, datetime.now(UTC)):
        raise LinkExpiredError()

    if resolve.has_password and not verify_link_password_grant(
        _grant_token(request, code), code
    ):
        raise LinkPasswordRequiredError()

    _schedule_click(background, request, redis, resolve.link_id)
    return RedirectResponse(
        resolve.target_url, status_code=settings.REDIRECT_STATUS_CODE
    )


@redirect_router.post(
    "/{code}",
    include_in_schema=False,
    dependencies=[Depends(rate_limit("redirect"))],
)
async def submit_password(
    code: str,
    payload: PasswordSubmit,
    request: Request,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> RedirectResponse:
    if is_reserved(code):
        raise LinkNotFoundError()

    # Load from DB to access the hashed password (never cached).
    link = await get_link_by_code(session, code)
    if link is None or not link.is_active:
        raise LinkNotFoundError()
    if _expired(link.expires_at, datetime.now(UTC)):
        raise LinkExpiredError()

    if not await verify_link_password(link.hashed_link_password, payload.password):
        raise InvalidLinkPasswordError()

    _schedule_click(background, request, redis, link.id)
    response = RedirectResponse(
        link.target_url, status_code=settings.REDIRECT_STATUS_CODE
    )
    if link.has_password:
        response.set_cookie(
            key=f"linkpw_{code}",
            value=create_link_password_grant(code),
            max_age=settings.LINK_PASSWORD_TOKEN_EXPIRE_MINUTES * 60,
            httponly=True,
            samesite="lax",
            secure=settings.is_production,
        )
    return response
