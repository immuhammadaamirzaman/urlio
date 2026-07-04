"""Admin operations: user moderation, link takedowns, global stats, audit log.

Every mutating action stages an :class:`AdminAudit` row on the session *before* the
commit that applies the action, so the audit entry and the action land atomically.
Cache invalidation happens after commit (a takedown must not keep serving from Redis).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    CannotModifySuperuserError,
    LinkNotFoundError,
    UserNotFoundError,
)
from app.models.admin_audit import AdminAudit
from app.models.click import Click
from app.models.link import Link
from app.models.user import User
from app.schemas.admin import AdminStats
from app.schemas.analytics import TimeBucket
from app.schemas.link import LinkUpdate
from app.services.analytics import _bucket_expr
from app.services.auth import revoke_all_refresh_tokens
from app.services.links import delete_link, invalidate_link_cache, update_link


def record_audit(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID,
    action: str,
    target_type: str,
    target_id: uuid.UUID | str,
    detail: str | None = None,
) -> None:
    """Stage an audit row; the caller's next commit persists it with the action."""
    session.add(
        AdminAudit(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            detail=detail,
        )
    )


# --- Users -------------------------------------------------------------------
async def get_user_or_404(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


async def search_users(
    session: AsyncSession, *, q: str | None, limit: int, offset: int
) -> tuple[list[tuple[User, int]], int]:
    """List users (newest first) with their link counts, optionally filtered by ``q``."""
    filters: list[ColumnElement[bool]] = []
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(User.email.ilike(pattern) | User.display_name.ilike(pattern))

    total = await session.scalar(select(func.count()).select_from(User).where(*filters))

    link_counts = (
        select(Link.owner_id, func.count().label("cnt"))
        .group_by(Link.owner_id)
        .subquery()
    )
    result = await session.execute(
        select(User, func.coalesce(link_counts.c.cnt, 0).label("link_count"))
        .outerjoin(link_counts, link_counts.c.owner_id == User.id)
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = [(row.User, int(row.link_count)) for row in result.all()]
    return rows, int(total or 0)


async def set_user_active(
    session: AsyncSession,
    redis: Redis,
    *,
    actor: User,
    target: User,
    is_active: bool,
    disable_links: bool = False,
) -> User:
    """Activate/deactivate an account. Deactivation revokes every refresh token.

    Superusers (including the actor themselves) cannot be targeted, which prevents
    self-lockout and admin-vs-admin takedowns; demote via the CLI first.
    """
    if target.is_superuser:
        raise CannotModifySuperuserError()

    target.is_active = is_active

    disabled_codes: list[str] = []
    if disable_links and not is_active:
        result = await session.execute(
            select(Link).where(Link.owner_id == target.id, Link.is_active.is_(True))
        )
        for link in result.scalars():
            link.is_active = False
            disabled_codes.append(link.code)

    record_audit(
        session,
        actor_id=actor.id,
        action="user.reactivate" if is_active else "user.deactivate",
        target_type="user",
        target_id=target.id,
        detail=f"disabled_links={len(disabled_codes)}" if disabled_codes else None,
    )
    await session.commit()
    await session.refresh(target)

    if not is_active:
        await revoke_all_refresh_tokens(redis, target.id)
    for code in disabled_codes:
        await invalidate_link_cache(redis, code)
    return target


# --- Links ---------------------------------------------------------------------
async def get_link_or_404(session: AsyncSession, link_id: uuid.UUID) -> Link:
    link = await session.get(Link, link_id)
    if link is None:
        raise LinkNotFoundError()
    return link


async def search_links(
    session: AsyncSession,
    *,
    q: str | None,
    owner_id: uuid.UUID | None,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Link, str | None]], int]:
    """List links (newest first) with owner emails, filtered by code/target/owner/state."""
    filters: list[ColumnElement[bool]] = []
    if q:
        pattern = f"%{q.strip()}%"
        filters.append(Link.code.ilike(pattern) | Link.target_url.ilike(pattern))
    if owner_id is not None:
        filters.append(Link.owner_id == owner_id)
    if is_active is not None:
        filters.append(Link.is_active.is_(is_active))

    total = await session.scalar(select(func.count()).select_from(Link).where(*filters))

    result = await session.execute(
        select(Link, User.email)
        .outerjoin(User, User.id == Link.owner_id)
        .where(*filters)
        .order_by(Link.created_at.desc(), Link.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = [(row.Link, row.email) for row in result.all()]
    return rows, int(total or 0)


async def admin_set_link_active(
    session: AsyncSession, redis: Redis, *, actor: User, link: Link, is_active: bool
) -> Link:
    """Force-enable/disable any link (takedown path). Invalidate + refresh the cache."""
    record_audit(
        session,
        actor_id=actor.id,
        action="link.enable" if is_active else "link.disable",
        target_type="link",
        target_id=link.code,
    )
    # update_link commits (persisting the audit row too) and refreshes the cache.
    return await update_link(session, redis, link, LinkUpdate(is_active=is_active))


async def admin_delete_link(
    session: AsyncSession, redis: Redis, *, actor: User, link: Link
) -> None:
    record_audit(
        session,
        actor_id=actor.id,
        action="link.delete",
        target_type="link",
        target_id=link.code,
        detail=f"target_url={link.target_url[:200]}",
    )
    await delete_link(session, redis, link)


# --- Stats / audit ---------------------------------------------------------------
async def get_global_stats(session: AsyncSession, *, days: int = 14) -> AdminStats:
    """Aggregate platform-wide counters. Click totals come from the DB, so they can
    trail Redis by up to one flush interval."""
    now = datetime.now(UTC)
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    window_start = now - timedelta(days=days)

    total_users = await session.scalar(select(func.count()).select_from(User))
    active_users = await session.scalar(
        select(func.count()).select_from(User).where(User.is_active.is_(True))
    )
    total_links = await session.scalar(select(func.count()).select_from(Link))
    active_links = await session.scalar(
        select(func.count()).select_from(Link).where(Link.is_active.is_(True))
    )
    total_clicks = await session.scalar(select(func.coalesce(func.sum(Link.click_count), 0)))
    clicks_last_24h = await session.scalar(
        select(func.count()).select_from(Click).where(Click.clicked_at >= day_ago)
    )
    new_users_last_7d = await session.scalar(
        select(func.count()).select_from(User).where(User.created_at >= week_ago)
    )
    new_links_last_7d = await session.scalar(
        select(func.count()).select_from(Link).where(Link.created_at >= week_ago)
    )

    dialect = session.get_bind().dialect.name
    bucket_col = _bucket_expr(dialect, Click.clicked_at, "day").label("bucket")
    ts_rows = (
        await session.execute(
            select(bucket_col, func.count().label("cnt"))
            .where(Click.clicked_at >= window_start)
            .group_by(bucket_col)
            .order_by(bucket_col)
        )
    ).all()

    return AdminStats(
        total_users=int(total_users or 0),
        active_users=int(active_users or 0),
        total_links=int(total_links or 0),
        active_links=int(active_links or 0),
        total_clicks=int(total_clicks or 0),
        clicks_last_24h=int(clicks_last_24h or 0),
        new_users_last_7d=int(new_users_last_7d or 0),
        new_links_last_7d=int(new_links_last_7d or 0),
        clicks_per_day=[TimeBucket(bucket=row.bucket, count=row.cnt) for row in ts_rows],
    )


async def list_audit(
    session: AsyncSession, *, limit: int, offset: int
) -> tuple[list[AdminAudit], int]:
    total = await session.scalar(select(func.count()).select_from(AdminAudit))
    result = await session.execute(
        select(AdminAudit)
        .order_by(AdminAudit.created_at.desc(), AdminAudit.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), int(total or 0)
