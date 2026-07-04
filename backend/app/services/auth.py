"""Authentication: registration, login, refresh-token rotation, and revocation.

Refresh tokens are single-use: rotating one invalidates the presented token. Active jtis
are tracked in Redis (a per-user set plus one key each) so logout and logout-all can
revoke them and a replayed/rotated token is rejected.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import (
    email_change_key,
    password_reset_key,
    refresh_jti_key,
    refresh_user_set_key,
)
from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyExistsError,
    InactiveUserError,
    InvalidCredentialsError,
    InvalidPasswordError,
    InvalidTokenError,
    TokenRevokedError,
)
from app.core.security import (
    create_access_token,
    create_email_change_token,
    create_password_reset_token,
    create_refresh_token,
    create_verify_email_token,
    decode_token,
    dummy_verify,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.token import TokenPair
from app.schemas.user import SessionRead, UserCreate
from app.services.email import (
    send_email_change_email,
    send_password_reset_email,
    send_verification_email,
)


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


async def issue_token_pair(
    redis: Redis,
    user: User,
    *,
    user_agent: str | None = None,
    created_at: str | None = None,
) -> TokenPair:
    """Mint an access+refresh pair and register the refresh jti (with session metadata).

    ``created_at`` carries the original session-start timestamp across rotations; when
    omitted (a fresh login) it defaults to now.
    """
    # The refresh jti is the session id; the access token is bound to it so revoking the
    # session (logout / logout-all / revoke / reset) invalidates the access token too.
    refresh_token, jti = create_refresh_token(user.id)
    access_token, _ = create_access_token(user.id, sid=jti)

    now = datetime.now(UTC).isoformat()
    metadata = {
        "created_at": created_at or now,
        "refreshed_at": None if created_at is None else now,
        "user_agent": user_agent,
    }
    await redis.sadd(refresh_user_set_key(user.id), jti)
    await redis.set(
        refresh_jti_key(user.id, jti),
        json.dumps(metadata),
        ex=settings.refresh_token_expire_seconds,
    )

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_seconds,
    )


async def rotate_refresh_token(
    session: AsyncSession, redis: Redis, refresh_token: str
) -> TokenPair:
    """Validate a refresh token, single-use it, and issue a fresh pair."""
    payload = decode_token(refresh_token, expected_type="refresh")
    user_id = payload.sub
    jti = payload.jti

    raw_meta = await redis.get(refresh_jti_key(user_id, jti))
    if raw_meta is None:
        raise TokenRevokedError()

    # Carry the original session-start time and user agent across the rotation.
    meta = _parse_session_meta(raw_meta)

    # Single-use rotation: invalidate the presented token before issuing a new one.
    await redis.delete(refresh_jti_key(user_id, jti))
    await redis.srem(refresh_user_set_key(user_id), jti)

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
        user_agent=meta.get("user_agent"),
        created_at=meta.get("created_at") or datetime.now(UTC).isoformat(),
    )


async def revoke_refresh_token(redis: Redis, user_id: uuid.UUID, jti: str) -> None:
    """Revoke a single refresh token (logout)."""
    await redis.delete(refresh_jti_key(user_id, jti))
    await redis.srem(refresh_user_set_key(user_id), jti)


async def revoke_all_refresh_tokens(redis: Redis, user_id: uuid.UUID) -> int:
    """Revoke every active refresh token for a user (logout-all). Returns the count."""
    set_key = refresh_user_set_key(user_id)
    jtis = await redis.smembers(set_key)
    if jtis:
        await redis.delete(*(refresh_jti_key(user_id, jti) for jti in jtis))
    await redis.delete(set_key)
    return len(jtis)


def _parse_session_meta(raw: str) -> dict:
    """Parse stored session metadata JSON, tolerating the legacy ``"1"`` value."""
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except (ValueError, TypeError):
        pass
    return {"created_at": None, "refreshed_at": None, "user_agent": None}


def _to_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


async def list_sessions(redis: Redis, user_id: uuid.UUID) -> list[SessionRead]:
    """List a user's active refresh-token sessions, newest first.

    Prunes any jtis that are in the user's set but whose metadata key has expired.
    """
    jtis = await redis.smembers(refresh_user_set_key(user_id))
    sessions: list[SessionRead] = []
    for jti in jtis:
        raw = await redis.get(refresh_jti_key(user_id, jti))
        if raw is None:
            # Expired key still lingering in the set: clean it up.
            await redis.srem(refresh_user_set_key(user_id), jti)
            continue
        meta = _parse_session_meta(raw)
        sessions.append(
            SessionRead(
                jti=jti,
                created_at=_to_datetime(meta.get("created_at")),
                refreshed_at=_to_datetime(meta.get("refreshed_at")),
                user_agent=meta.get("user_agent"),
            )
        )
    _epoch = datetime.min.replace(tzinfo=UTC)
    sessions.sort(key=lambda s: s.created_at or _epoch, reverse=True)
    return sessions


async def resolve_current_user(
    session: AsyncSession, redis: Redis, token: str
) -> User:
    """Decode an access token, verify its session is still active, and load the user."""
    payload = decode_token(token, expected_type="access")
    # Session-bound access tokens: reject if the originating session was revoked. (Tokens
    # minted before this feature carry no sid and fall back to expiry-only validity.)
    if payload.sid is not None and not await redis.exists(
        refresh_jti_key(payload.sub, payload.sid)
    ):
        raise TokenRevokedError()
    try:
        user = await get_user_by_id(session, uuid.UUID(payload.sub))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    if user is None:
        raise InvalidTokenError()
    if not user.is_active:
        raise InactiveUserError()
    return user


# --- Email verification ----------------------------------------------------
async def send_user_verification_email(user: User) -> None:
    """Issue a verification token for ``user`` and email it. Best-effort."""
    token = create_verify_email_token(user.id)
    await send_verification_email(user.email, token)


async def verify_email(session: AsyncSession, token: str) -> User:
    """Consume an email-verification token and mark the user's email verified.

    Idempotent: verifying an already-verified account succeeds.
    """
    payload = decode_token(token, expected_type="verify_email")
    try:
        user = await get_user_by_id(session, uuid.UUID(payload.sub))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    if user is None:
        raise InvalidTokenError()
    if not user.email_verified:
        user.email_verified = True
        await session.commit()
        await session.refresh(user)
    return user


# --- Password reset --------------------------------------------------------
async def initiate_password_reset(session: AsyncSession, redis: Redis, email: str) -> None:
    """Start a password reset. Always succeeds (never leaks whether the email exists)."""
    user = await _get_user_by_email(session, email)
    if user is None or not user.is_active:
        return
    token = create_password_reset_token(user.id)
    # Record the token jti so it can be used exactly once (see reset_password).
    payload = decode_token(token, expected_type="reset_password")
    await redis.set(
        password_reset_key(payload.jti),
        str(user.id),
        ex=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES * 60,
    )
    await send_password_reset_email(user.email, token)


async def reset_password(
    session: AsyncSession, redis: Redis, token: str, new_password: str
) -> None:
    """Consume a single-use reset token, set the new password, and revoke all sessions."""
    payload = decode_token(token, expected_type="reset_password")

    # Single-use: DELETE returns the number of keys removed, so it atomically consumes
    # the marker — a second use finds nothing removed and is rejected.
    if not await redis.delete(password_reset_key(payload.jti)):
        raise InvalidTokenError("This reset link has already been used or expired.")

    try:
        user = await get_user_by_id(session, uuid.UUID(payload.sub))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    # Re-check is_active: the account may have been deactivated after the link was issued
    # (mirrors the guard in initiate_password_reset so a frozen account can't be mutated).
    if user is None or not user.is_active:
        raise InvalidTokenError()

    user.hashed_password = await hash_password(new_password)
    await session.commit()
    # Invalidate every existing session — a reset should log out all devices.
    await revoke_all_refresh_tokens(redis, user.id)


# --- Email change ----------------------------------------------------------
async def request_email_change(
    session: AsyncSession, redis: Redis, user: User, new_email: str, password: str
) -> None:
    """Verify the password and email a single-use confirm link to the new address.

    To avoid an authenticated account-enumeration oracle (cf. initiate_password_reset),
    a new email that already belongs to *another* account is treated as a silent no-op:
    the caller still gets a 204 and simply never receives a confirmation link.
    """
    if not await verify_password(password, user.hashed_password):
        raise InvalidPasswordError()
    normalized = new_email.lower()
    if normalized == user.email:
        # Reveals nothing about other accounts (it's the caller's own address).
        raise EmailAlreadyExistsError("That is already your email address.")
    if await _get_user_by_email(session, normalized) is not None:
        return  # address taken by someone else — do not confirm, do not leak

    token = create_email_change_token(user.id, normalized)
    payload = decode_token(token, expected_type="email_change")
    # Single-use marker (also lets the change be invalidated early).
    await redis.set(
        email_change_key(payload.jti),
        str(user.id),
        ex=settings.EMAIL_CHANGE_TOKEN_EXPIRE_HOURS * 3600,
    )
    await send_email_change_email(normalized, token)


async def confirm_email_change(session: AsyncSession, redis: Redis, token: str) -> User:
    """Consume a single-use email-change token and switch the account's email address."""
    payload = decode_token(token, expected_type="email_change")
    new_email = (payload.email or "").lower()
    if not new_email:
        raise InvalidTokenError()

    # Single-use: atomically consume the marker before applying the change.
    if not await redis.delete(email_change_key(payload.jti)):
        raise InvalidTokenError("This confirmation link has already been used or expired.")

    try:
        user = await get_user_by_id(session, uuid.UUID(payload.sub))
    except ValueError as exc:
        raise InvalidTokenError() from exc
    if user is None:
        raise InvalidTokenError()

    # The address may have been taken between request and confirmation.
    existing = await _get_user_by_email(session, new_email)
    if existing is not None and existing.id != user.id:
        raise EmailAlreadyExistsError()

    user.email = new_email
    user.email_verified = True  # they proved control of the new address
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise EmailAlreadyExistsError() from exc
    await session.refresh(user)
    return user
