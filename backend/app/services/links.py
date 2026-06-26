"""Link business logic: create, resolve (hot path), manage, and cache.

Future hook: anonymous links (``owner_id`` is NULL) cannot be claimed by a user in v1.
A ``claim_link`` operation would live here once that feature is designed.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import (
    cache_get_json,
    cache_set_json,
    link_cache_key,
    link_negative_key,
)
from app.core.config import settings
from app.core.exceptions import (
    AliasConflictError,
    LinkNotFoundError,
    ShortcodeGenerationError,
)
from app.core.security import hash_password, verify_password
from app.core.url_validation import validate_and_normalize_url
from app.models.link import Link
from app.schemas.link import LinkCreate, LinkRead, LinkResolve, LinkUpdate
from app.services.shortcode import (
    code_exists,
    generate_unique_code,
    validate_custom_alias,
)


def _aware_utc(value: datetime | None) -> datetime | None:
    """Normalize a datetime to timezone-aware UTC (assume UTC if naive)."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _to_resolve(link: Link) -> LinkResolve:
    return LinkResolve(
        code=link.code,
        target_url=link.target_url,
        is_active=link.is_active,
        has_password=link.has_password,
        expires_at=_aware_utc(link.expires_at),
        link_id=link.id,
    )


async def _cache_link(redis: Redis, link: Link | LinkResolve) -> None:
    resolve = link if isinstance(link, LinkResolve) else _to_resolve(link)
    await cache_set_json(
        redis,
        link_cache_key(resolve.code),
        resolve.model_dump(mode="json"),
        settings.CACHE_TTL_SECONDS,
    )


async def invalidate_link_cache(redis: Redis, code: str) -> None:
    await redis.delete(link_cache_key(code), link_negative_key(code))


async def create_link(
    session: AsyncSession,
    redis: Redis,
    data: LinkCreate,
    owner_id: uuid.UUID | None,
) -> Link:
    """Create a short link, generating or validating its code and pre-filling the cache."""
    target = validate_and_normalize_url(data.target_url)

    if data.custom_alias:
        validate_custom_alias(data.custom_alias)
        if await code_exists(session, redis, data.custom_alias):
            raise AliasConflictError()
        code = data.custom_alias
        is_custom = True
    else:
        code = await generate_unique_code(session, redis)
        is_custom = False

    link = Link(
        code=code,
        target_url=target,
        owner_id=owner_id,
        is_custom_alias=is_custom,
        expires_at=_aware_utc(data.expires_at),
        hashed_link_password=hash_password(data.password) if data.password else None,
    )
    session.add(link)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        # Lost a race on the unique ``code`` constraint.
        if is_custom:
            raise AliasConflictError() from exc
        raise ShortcodeGenerationError() from exc

    await session.refresh(link)
    await _cache_link(redis, link)
    return link


async def get_link_by_code(session: AsyncSession, code: str) -> Link | None:
    result = await session.execute(select(Link).where(Link.code == code))
    return result.scalar_one_or_none()


async def get_link_for_owner(
    session: AsyncSession, link_id: uuid.UUID, owner_id: uuid.UUID
) -> Link:
    """Return a link owned by ``owner_id`` or raise (no existence leak to non-owners)."""
    result = await session.execute(
        select(Link).where(Link.id == link_id, Link.owner_id == owner_id)
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise LinkNotFoundError()
    return link


async def list_links(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    limit: int,
    offset: int,
    cursor: str | None = None,
) -> tuple[list[Link], int]:
    """List a user's links, newest first, with the total count. (Offset pagination; the
    ``cursor`` parameter is reserved for a future keyset implementation.)"""
    total = await session.scalar(
        select(func.count()).select_from(Link).where(Link.owner_id == owner_id)
    )
    result = await session.execute(
        select(Link)
        .where(Link.owner_id == owner_id)
        .order_by(Link.created_at.desc(), Link.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), int(total or 0)


async def update_link(
    session: AsyncSession, redis: Redis, link: Link, data: LinkUpdate
) -> Link:
    """Apply a partial update. Only fields explicitly set in the request are touched."""
    fields = data.model_dump(exclude_unset=True)

    if "target_url" in fields and fields["target_url"] is not None:
        link.target_url = validate_and_normalize_url(fields["target_url"])
    if "is_active" in fields and fields["is_active"] is not None:
        link.is_active = fields["is_active"]
    if "expires_at" in fields:
        link.expires_at = _aware_utc(fields["expires_at"])
    if "password" in fields:
        password = fields["password"]
        link.hashed_link_password = hash_password(password) if password else None

    await session.commit()
    await session.refresh(link)
    await invalidate_link_cache(redis, link.code)
    await _cache_link(redis, link)
    return link


async def delete_link(session: AsyncSession, redis: Redis, link: Link) -> None:
    code = link.code
    await session.delete(link)
    await session.commit()
    await invalidate_link_cache(redis, code)


async def resolve_for_redirect(
    session: AsyncSession, redis: Redis, code: str
) -> LinkResolve:
    """Hot path: resolve a code to its target, using the cache + negative cache.

    Does not interpret expiry/active status — the caller decides 404 vs 410.
    """
    cached = await cache_get_json(redis, link_cache_key(code))
    if cached is not None:
        return LinkResolve(**cached)

    if await redis.exists(link_negative_key(code)):
        raise LinkNotFoundError()

    link = await get_link_by_code(session, code)
    if link is None:
        await redis.set(
            link_negative_key(code), "1", ex=settings.NEGATIVE_CACHE_TTL_SECONDS
        )
        raise LinkNotFoundError()

    await _cache_link(redis, link)
    return _to_resolve(link)


def is_expired(resolve: LinkResolve, now: datetime) -> bool:
    expires = _aware_utc(resolve.expires_at)
    return expires is not None and expires < now


def verify_link_password(hashed: str | None, password: str) -> bool:
    """Return True if ``password`` matches (or the link has no password set)."""
    if not hashed:
        return True
    return verify_password(password, hashed)


def to_link_read(link: Link, base_url: str) -> LinkRead:
    """Build the public read model, including the computed short URL."""
    return LinkRead(
        id=link.id,
        code=link.code,
        short_url=f"{base_url.rstrip('/')}/{link.code}",
        target_url=link.target_url,
        owner_id=link.owner_id,
        is_custom_alias=link.is_custom_alias,
        is_active=link.is_active,
        has_password=link.has_password,
        expires_at=link.expires_at,
        click_count=link.click_count,
        last_clicked_at=link.last_clicked_at,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )
