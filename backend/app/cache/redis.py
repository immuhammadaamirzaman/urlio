"""Async Redis client, connection pool, key builders, and JSON helpers.

All key names are produced by the builder functions below — code must never hard-code
Redis key strings so that key layout stays consistent and greppable.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Awaitable
from typing import TypeVar, cast

from redis.asyncio import ConnectionPool, Redis

from app.core.config import settings

_pool: ConnectionPool | None = None
_client: Redis | None = None

T = TypeVar("T")


async def redis_await(result: Awaitable[T] | T) -> T:
    """Await a redis-py command. The async client always returns an awaitable, but its
    stubs advertise ``Awaitable[T] | T`` (shared with the sync client), confusing mypy."""
    return await cast("Awaitable[T]", result)


def get_redis_pool() -> ConnectionPool:
    """Return the process-wide Redis connection pool (created on first use)."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            decode_responses=True,
        )
    return _pool


def get_redis() -> Redis:
    """Return the shared async Redis client."""
    global _client
    if _client is None:
        _client = Redis(connection_pool=get_redis_pool())
    return _client


async def close_redis() -> None:
    """Close the Redis client and disconnect the pool on shutdown."""
    global _client, _pool
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.disconnect()
        _pool = None


async def ping_redis(client: Redis | None = None) -> bool:
    """Return True if Redis responds to PING (readiness probe)."""
    try:
        return bool(await (client or get_redis()).ping())
    except Exception:
        return False


# --- Key builders ----------------------------------------------------------
def link_cache_key(code: str) -> str:
    return f"link:{code}"


def link_negative_key(code: str) -> str:
    return f"link:miss:{code}"


def click_count_key(link_id: str | uuid.UUID) -> str:
    return f"clicks:count:{link_id}"


def refresh_jti_key(user_id: str | uuid.UUID, jti: str) -> str:
    return f"refresh:jti:{user_id}:{jti}"


def refresh_user_set_key(user_id: str | uuid.UUID) -> str:
    return f"refresh:user:{user_id}"


def link_password_grant_key(code: str, grant_id: str) -> str:
    return f"linkpw:grant:{code}:{grant_id}"


def password_reset_key(token_hash: str) -> str:
    return f"pwreset:{token_hash}"


def email_verify_key(token_hash: str) -> str:
    return f"emailverify:{token_hash}"


def email_change_key(token_hash: str) -> str:
    return f"emailchange:{token_hash}"


def rate_limit_key(scope: str, identifier: str, window_start: int) -> str:
    return f"rl:{scope}:{identifier}:{window_start}"


# --- JSON helpers ----------------------------------------------------------
async def cache_get_json(redis: Redis, key: str) -> dict | None:
    """Return a parsed JSON object stored at ``key`` (or None)."""
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


async def cache_set_json(redis: Redis, key: str, value: dict, ttl: int) -> None:
    """Store ``value`` as JSON at ``key`` with a TTL in seconds."""
    await redis.set(key, json.dumps(value, default=str), ex=ttl)
