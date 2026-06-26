"""Redis-backed fixed-window rate limiting.

A fixed-window counter (``INCR`` + ``EXPIRE``) is O(1) and atomic enough for abuse
control. The window is rounded to ``window_seconds`` so all replicas agree on the bucket
without coordination — keeping the app stateless and horizontally scalable.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from redis.asyncio import Redis

from app.cache.redis import rate_limit_key


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    reset_at: int
    retry_after: int


async def check_rate_limit(
    redis: Redis,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> RateLimitResult:
    """Increment the current window counter and report whether the request is allowed."""
    now = int(time.time())
    window_start = now - (now % window_seconds)
    key = rate_limit_key(scope, identifier, window_start)

    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_seconds)

    reset_at = window_start + window_seconds
    remaining = max(0, limit - count)
    allowed = count <= limit
    retry_after = max(1, reset_at - now) if not allowed else 0

    return RateLimitResult(
        allowed=allowed,
        limit=limit,
        remaining=remaining,
        reset_at=reset_at,
        retry_after=retry_after,
    )
