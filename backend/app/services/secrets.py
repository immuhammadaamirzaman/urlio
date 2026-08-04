"""Encrypt and consume one-time secret shares safely."""

from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    SecretShareConsumedError,
    SecretShareExpiredError,
    SecretShareNotFoundError,
)
from app.models.secret import SecretShare


def _aware_utc(value: datetime | None) -> datetime | None:
    """Normalize a datetime to timezone-aware UTC (assume UTC if naive)."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _derive_encryption_key() -> bytes:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return digest[:32]


def _encrypt_secret(secret: str) -> tuple[str, str]:
    key = _derive_encryption_key()
    nonce = secrets.token_bytes(12)
    ciphertext = AESGCM(key).encrypt(nonce, secret.encode("utf-8"), None)
    return base64.b64encode(ciphertext).decode("ascii"), base64.b64encode(nonce).decode("ascii")


def _decrypt_secret(ciphertext_b64: str | None, nonce_b64: str | None) -> str:
    # The payload is wiped on consumption, so a missing ciphertext means "already used" —
    # report it as such rather than as an expiry.
    if not ciphertext_b64 or not nonce_b64:
        raise SecretShareConsumedError()
    key = _derive_encryption_key()
    ciphertext = base64.b64decode(ciphertext_b64.encode("ascii"))
    nonce = base64.b64decode(nonce_b64.encode("ascii"))
    try:
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, None)
    except Exception as exc:  # noqa: BLE001
        raise SecretShareExpiredError("This secret share could not be decrypted.") from exc
    return plaintext.decode("utf-8")


async def create_secret_share(
    session: AsyncSession,
    secret: str,
    *,
    expires_in_seconds: int,
) -> SecretShare:
    ciphertext, nonce = _encrypt_secret(secret)
    now = _aware_utc(datetime.now(UTC))
    expires_at = _aware_utc(datetime.now(UTC) + timedelta(seconds=expires_in_seconds))
    share = SecretShare(
        token=secrets.token_urlsafe(24),
        ciphertext=ciphertext,
        nonce=nonce,
        expires_at=expires_at,
        created_at=now,
        updated_at=now,
    )
    session.add(share)
    await session.commit()
    await session.refresh(share)
    return share


async def open_secret_share(
    session: AsyncSession,
    redis: Redis,
    token: str,
) -> tuple[str, datetime]:
    now = _aware_utc(datetime.now(UTC))
    marker_key = f"secret:consumed:{token}"

    share = await session.scalar(select(SecretShare).where(SecretShare.token == token))
    if share is None:
        await redis.delete(marker_key)
        raise SecretShareNotFoundError()

    if _aware_utc(share.expires_at) is not None and _aware_utc(share.expires_at) < now:
        await redis.delete(marker_key)
        raise SecretShareExpiredError()

    if share.consumed_at is not None:
        await redis.set(marker_key, "1", ex=60)
        raise SecretShareConsumedError()

    ttl = max(60, int((_aware_utc(share.expires_at) - now).total_seconds()))
    claimed = await redis.set(marker_key, "1", ex=ttl, nx=True)
    if not claimed:
        raise SecretShareConsumedError()

    try:
        secret = _decrypt_secret(share.ciphertext, share.nonce)
        share.consumed_at = now
        share.ciphertext = None
        share.nonce = None
        await session.commit()
    except Exception:
        await redis.delete(marker_key)
        raise

    return secret, share.expires_at
