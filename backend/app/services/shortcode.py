"""Short-code generation and custom-alias validation.

Codes are random Base62 strings drawn from a CSPRNG (``secrets``) so they are unguessable
and there is no central counter to serialize writes — supporting horizontal scale.
"""

from __future__ import annotations

import secrets

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import link_cache_key
from app.core.config import settings
from app.core.exceptions import (
    InvalidAliasError,
    ReservedCodeError,
    ShortcodeGenerationError,
)
from app.models.link import Link

# Codes/aliases that must never be issued so the redirect catch-all never shadows a real
# route (and to avoid confusing/abusable vanity links).
RESERVED_CODES: frozenset[str] = frozenset(
    {
        "health",
        "readyz",
        "api",
        "docs",
        "redoc",
        "openapi.json",
        "static",
        "favicon.ico",
        "robots.txt",
        "metrics",
        "admin",
        "",
        "login",
        "logout",
        "register",
        "refresh",
        "users",
        "links",
        "me",
        "www",
        "assets",
        ".well-known",
    }
)


def generate_random_code(length: int, alphabet: str) -> str:
    """Generate a cryptographically-random code of ``length`` from ``alphabet``."""
    return "".join(secrets.choice(alphabet) for _ in range(length))


def is_reserved(code: str) -> bool:
    """Case-insensitive check against the reserved set."""
    return code.lower() in RESERVED_CODES


def validate_custom_alias(alias: str) -> None:
    """Validate a user-supplied custom alias (charset, length, reserved words)."""
    if not (settings.CUSTOM_ALIAS_MIN_LENGTH <= len(alias) <= settings.CUSTOM_ALIAS_MAX_LENGTH):
        raise InvalidAliasError(
            f"Alias must be between {settings.CUSTOM_ALIAS_MIN_LENGTH} and "
            f"{settings.CUSTOM_ALIAS_MAX_LENGTH} characters."
        )
    allowed = set(settings.SHORTCODE_ALPHABET)
    if not set(alias) <= allowed:
        raise InvalidAliasError("Alias may only contain letters and digits.")
    if is_reserved(alias):
        raise ReservedCodeError()


async def code_exists(session: AsyncSession, redis: Redis, code: str) -> bool:
    """Return True if ``code`` is taken (checks the cache first, then the database)."""
    if await redis.exists(link_cache_key(code)):
        return True
    result = await session.execute(select(Link.id).where(Link.code == code).limit(1))
    return result.first() is not None


async def generate_unique_code(
    session: AsyncSession,
    redis: Redis,
    *,
    length: int | None = None,
    max_retries: int | None = None,
) -> str:
    """Generate a code that is not reserved and not already in use.

    Retries up to ``max_retries`` at a given length, then bumps the length by one, up to
    ``SHORTCODE_MAX_LENGTH``. Raises :class:`ShortcodeGenerationError` if exhausted.
    """
    length = length or settings.SHORTCODE_LENGTH
    max_retries = max_retries if max_retries is not None else settings.SHORTCODE_MAX_RETRIES

    while length <= settings.SHORTCODE_MAX_LENGTH:
        for _ in range(max_retries):
            code = generate_random_code(length, settings.SHORTCODE_ALPHABET)
            if is_reserved(code):
                continue
            if not await code_exists(session, redis, code):
                return code
        length += 1

    raise ShortcodeGenerationError()
