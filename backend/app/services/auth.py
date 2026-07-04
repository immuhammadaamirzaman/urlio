"""Authentication: registration, login, refresh-token rotation, and revocation.

Refresh tokens are single-use: rotating one invalidates the presented token. Active jtis
are tracked in Redis (a per-user set plus one key each) so logout and logout-all can
revoke them and a replayed/rotated token is rejected. Each jti key stores JSON session
metadata (created/refreshed timestamps, user agent, hashed IP) powering the "active
sessions" listing; rotation carries the original ``created_at`` forward so a session's
lineage survives token refreshes.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import redis_await, refresh_jti_key, refresh_user_set_key
from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyExistsError,
    InactiveUserError,
    InvalidCredentialsError,
    InvalidTokenError,
    TokenRevokedError,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    dummy_verify,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.token import SessionRead, TokenPair
from app.schemas.user import UserCreate


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def _get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def register_user(session: AsyncSession, data: UserCreate) -> User:
    """Create a new user; raises if the email is already registered."""
    user = User(
        email=data.email.lower(),
        hashed_password=await hash_password(data.password),
        display_name=data.display_name,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise EmailAlreadyExistsError() from exc
    await session.refresh(user)
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    """Verify credentials, returning the user. Raises a generic error on any failure."""
    user = await _get_user_by_email(session, email)
    if user is None:
        # Equalize timing so a missing account is indistinguishable from a wrong password.
        await dummy_verify()
        raise InvalidCredentialsError()
    if not await verify_password(password, user.hashed_password):
        raise InvalidCredentialsError()
    if not user.is_active:
        raise InactiveUserError()
    return user


def _session_metadata(
    created_at: str | None, user_agent: str | None, ip_hash: str | None
) -> str:
    now = datetime.now(UTC).isoformat()
    return json.dumps(
        {
            "created_at": created_at or now,
            "refreshed_at": now,
            "user_agent": user_agent[:512] if user_agent else None,
            "ip_hash": ip_hash,
        }
    )


def _parse_session_metadata(raw: str | None) -> dict:
    """Parse a jti value; tolerates the legacy ``"1"`` marker written before v0.2."""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


async def issue_token_pair(
    redis: Redis,
    user: User,
    *,
    user_agent: str | None = None,
    ip_hash: str | None = None,
    session_created_at: str | None = None,
) -> TokenPair:
    """Mint an access+refresh pair and register the refresh jti in Redis.

    ``session_created_at`` is passed by rotation to preserve the session's origin time.
    """
    access_token, _ = create_access_token(user.id)
    refresh_token, jti = create_refresh_token(user.id)

    await redis_await(redis.sadd(refresh_user_set_key(user.id), jti))
    await redis_await(
        redis.set(
            refresh_jti_key(user.id, jti),
            _session_metadata(session_created_at, user_agent, ip_hash),
            ex=settings.refresh_token_expire_seconds,
        )
    )

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_seconds,
    )


async def rotate_refresh_token(
    session: AsyncSession,
    redis: Redis,
    refresh_token: str,
    *,
    user_agent: str | None = None,
    ip_hash: str | None = None,
) -> TokenPair:
    """Validate a refresh token, single-use it, and issue a fresh pair."""
    payload = decode_token(refresh_token, expected_type="refresh")
    user_id = payload.sub
    jti = payload.jti

    raw: str | None = await redis_await(redis.get(refresh_jti_key(user_id, jti)))
    if raw is None:
        raise TokenRevokedError()
    session_created_at = _parse_session_metadata(raw).get("created_at")

    # Single-use rotation: invalidate the presented token before issuing a new one.
    await redis_await(redis.delete(refresh_jti_key(user_id, jti)))
    await redis_await(redis.srem(refresh_user_set_key(user_id), jti))

    try:
        user = await get_user_by_id(session, uuid.UUID(user_id))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    if user is None:
        raise InvalidTokenError()
    if not user.is_active:
        raise InactiveUserError()

    return await issue_token_pair(
        redis,
        user,
        user_agent=user_agent,
        ip_hash=ip_hash,
        session_created_at=session_created_at,
    )


async def revoke_refresh_token(redis: Redis, user_id: uuid.UUID, jti: str) -> None:
    """Revoke a single refresh token (logout)."""
    await redis_await(redis.delete(refresh_jti_key(user_id, jti)))
    await redis_await(redis.srem(refresh_user_set_key(user_id), jti))


async def revoke_all_refresh_tokens(redis: Redis, user_id: uuid.UUID) -> int:
    """Revoke every active refresh token for a user (logout-all). Returns the count."""
    set_key = refresh_user_set_key(user_id)
    jtis: set[str] = await redis_await(redis.smembers(set_key))
    if jtis:
        await redis_await(redis.delete(*(refresh_jti_key(user_id, jti) for jti in jtis)))
    await redis_await(redis.delete(set_key))
    return len(jtis)


async def list_sessions(redis: Redis, user_id: uuid.UUID) -> list[SessionRead]:
    """List active sessions (one per live refresh jti), most recently refreshed first.

    Jtis whose metadata key has expired are pruned from the per-user set lazily.
    """
    set_key = refresh_user_set_key(user_id)
    members: set[str] = await redis_await(redis.smembers(set_key))
    jtis = sorted(members)
    if not jtis:
        return []

    values: list[str | None] = await redis_await(
        redis.mget([refresh_jti_key(user_id, jti) for jti in jtis])
    )

    sessions: list[SessionRead] = []
    stale: list[str] = []
    for jti, raw in zip(jtis, values, strict=True):
        if raw is None:
            stale.append(jti)
            continue
        meta = _parse_session_metadata(raw)
        sessions.append(
            SessionRead(
                jti=jti,
                created_at=meta.get("created_at"),
                refreshed_at=meta.get("refreshed_at"),
                user_agent=meta.get("user_agent"),
            )
        )
    if stale:
        await redis_await(redis.srem(set_key, *stale))

    epoch = datetime.min.replace(tzinfo=UTC)
    sessions.sort(key=lambda s: s.refreshed_at or s.created_at or epoch, reverse=True)
    return sessions


async def resolve_current_user(session: AsyncSession, token: str) -> User:
    """Decode an access token and load the active user it refers to."""
    payload = decode_token(token, expected_type="access")
    try:
        user = await get_user_by_id(session, uuid.UUID(payload.sub))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    if user is None:
        raise InvalidTokenError()
    if not user.is_active:
        raise InactiveUserError()
    return user
