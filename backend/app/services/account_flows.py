"""Email-driven account flows: password reset, email verification, email change.

Tokens are 256-bit URL-safe secrets. Only their SHA-256 hash is stored (in Redis, with
a TTL), so a leaked Redis snapshot cannot be replayed, and every token is single-use.
"Request" flows respond identically whether or not the account exists, and email
delivery failures are swallowed (logged) so response shape/timing never leaks account
existence.
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import uuid

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import (
    email_change_key,
    email_verify_key,
    password_reset_key,
    redis_await,
)
from app.core.config import settings
from app.core.exceptions import (
    EmailAlreadyExistsError,
    InvalidCurrentPasswordError,
    InvalidEmailChangeTokenError,
    InvalidResetTokenError,
    InvalidVerificationTokenError,
)
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.services.auth import revoke_all_refresh_tokens
from app.services.mailer import send_email

logger = logging.getLogger("shortlyx.account_flows")


def _new_token() -> tuple[str, str]:
    """Return ``(token, token_hash)`` for a fresh single-use token."""
    token = secrets.token_urlsafe(32)
    return token, _hash_token(token)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_link(path: str, token: str) -> str:
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/{path}?token={token}"


async def _consume_token(redis: Redis, key: str) -> str | None:
    """Atomically-enough read+delete a token key; None if missing or already used."""
    raw: str | None = await redis_await(redis.get(key))
    if raw is None:
        return None
    deleted: int = await redis_await(redis.delete(key))
    if not deleted:  # lost a race with a concurrent use — treat as spent
        return None
    return raw


async def _safe_send(to: str, subject: str, body: str) -> None:
    """Send without raising: mail outages must not fail (or fingerprint) requests."""
    try:
        await send_email(to, subject, body)
    except Exception:  # noqa: BLE001 - deliberately swallow transport failures
        logger.warning("email_send_failed to=%s subject=%r", to, subject, exc_info=True)


# --- Password reset ----------------------------------------------------------
async def request_password_reset(session: AsyncSession, redis: Redis, email: str) -> None:
    """Issue a reset token and email it. Silently does nothing for unknown accounts."""
    result = await session.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return

    token, token_hash = _new_token()
    await redis_await(
        redis.set(
            password_reset_key(token_hash),
            str(user.id),
            ex=settings.RESET_TOKEN_EXPIRE_MINUTES * 60,
        )
    )
    await _safe_send(
        user.email,
        "Reset your ShortlyX password",
        (
            "Someone requested a password reset for this account.\n\n"
            f"Reset your password: {_frontend_link('reset-password', token)}\n\n"
            f"The link expires in {settings.RESET_TOKEN_EXPIRE_MINUTES} minutes. "
            "If you didn't request this, you can safely ignore this email."
        ),
    )


async def reset_password(
    session: AsyncSession, redis: Redis, token: str, new_password: str
) -> None:
    """Set a new password from a reset token and revoke every session."""
    raw = await _consume_token(redis, password_reset_key(_hash_token(token)))
    if raw is None:
        raise InvalidResetTokenError()
    user = await session.get(User, uuid.UUID(raw))
    if user is None or not user.is_active:
        raise InvalidResetTokenError()

    user.hashed_password = await hash_password(new_password)
    await session.commit()
    await revoke_all_refresh_tokens(redis, user.id)


# --- Email verification --------------------------------------------------------
async def send_verification_email(redis: Redis, user: User) -> None:
    """Issue a verification token and email it (no-op if already verified)."""
    if user.email_verified:
        return
    token, token_hash = _new_token()
    await redis_await(
        redis.set(
            email_verify_key(token_hash),
            str(user.id),
            ex=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS * 3600,
        )
    )
    await _safe_send(
        user.email,
        "Verify your ShortlyX email address",
        (
            "Welcome to ShortlyX!\n\n"
            f"Verify your email: {_frontend_link('verify-email', token)}\n\n"
            f"The link expires in {settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS} hours."
        ),
    )


async def verify_email(session: AsyncSession, redis: Redis, token: str) -> User:
    raw = await _consume_token(redis, email_verify_key(_hash_token(token)))
    if raw is None:
        raise InvalidVerificationTokenError()
    user = await session.get(User, uuid.UUID(raw))
    if user is None or not user.is_active:
        raise InvalidVerificationTokenError()

    user.email_verified = True
    await session.commit()
    return user


# --- Email change ---------------------------------------------------------------
async def request_email_change(
    session: AsyncSession, redis: Redis, user: User, new_email: str, password: str
) -> None:
    """Start an email change: verify the password, then mail a confirm link to the
    NEW address (proving its owner consents before anything changes)."""
    if not await verify_password(password, user.hashed_password):
        raise InvalidCurrentPasswordError()

    normalized = new_email.lower()
    taken = await session.scalar(select(User.id).where(User.email == normalized))
    if taken is not None:
        raise EmailAlreadyExistsError()

    token, token_hash = _new_token()
    await redis_await(
        redis.set(
            email_change_key(token_hash),
            json.dumps({"user_id": str(user.id), "new_email": normalized}),
            ex=settings.EMAIL_CHANGE_TOKEN_EXPIRE_MINUTES * 60,
        )
    )
    await _safe_send(
        normalized,
        "Confirm your new ShortlyX email address",
        (
            f"A request was made to change a ShortlyX account's email to {normalized}.\n\n"
            f"Confirm the change: {_frontend_link('confirm-email-change', token)}\n\n"
            f"The link expires in {settings.EMAIL_CHANGE_TOKEN_EXPIRE_MINUTES} minutes. "
            "If this wasn't you, ignore this email and nothing will change."
        ),
    )


async def confirm_email_change(session: AsyncSession, redis: Redis, token: str) -> User:
    """Apply a pending email change and revoke every session (credential rotation)."""
    raw = await _consume_token(redis, email_change_key(_hash_token(token)))
    if raw is None:
        raise InvalidEmailChangeTokenError()
    try:
        payload = json.loads(raw)
        user_id = uuid.UUID(payload["user_id"])
        new_email = str(payload["new_email"])
    except (ValueError, TypeError, KeyError) as exc:
        raise InvalidEmailChangeTokenError() from exc

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise InvalidEmailChangeTokenError()

    # Re-check uniqueness: the address may have been registered since the request.
    taken = await session.scalar(
        select(User.id).where(User.email == new_email, User.id != user.id)
    )
    if taken is not None:
        raise EmailAlreadyExistsError()

    user.email = new_email
    user.email_verified = True  # confirming the link proves control of the new address
    await session.commit()
    await revoke_all_refresh_tokens(redis, user.id)
    return user
