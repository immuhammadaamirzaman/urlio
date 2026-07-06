"""Admin (superuser) operations: user/link management, platform stats, audit trail.

Every mutation writes an :class:`AuditLog` row so privileged actions are traceable.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    LinkNotFoundError,
    NotAuthorizedError,
    UserNotFoundError,
)
from app.models.audit import AuditLog
from app.models.click import Click
from app.models.link import Link
from app.models.user import User
from app.schemas.admin import AdminLinkRead, AdminStats, AdminUserRead, AuditRead
from app.schemas.analytics import TimeBucket
from app.services.analytics import _bucket_expr
from app.services.auth import revoke_all_refresh_tokens
from app.services.links import invalidate_link_cache, to_link_read


async def record_audit(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str,
    target_id: str,
    detail: str | None = None,
    commit: bool = True,
) -> None:
    """Append an audit-log entry. Flushed with the surrounding transaction by default."""
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
    )
    if commit:
        await session.commit()


# --- Users -----------------------------------------------------------------
def _to_admin_user(user: User, link_count: int) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        email_verified=user.email_verified,
        deleted_at=user.deleted_at,
        link_count=link_count,
        created_at=user.created_at,
    )


async def list_users(
    session: AsyncSession, *, q: str | None, limit: int, offset: int
) -> tuple[list[AdminUserRead], int]:
    """List users (with their link counts), newest first, filtered by an optional query."""
    filters = []
    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(User.email.ilike(pattern), User.display_name.ilike(pattern))
        )

    total = await session.scalar(select(func.count()).select_from(User).where(*filters))

    link_count = (
        select(func.count(Link.id))
        .where(Link.owner_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(User, link_count.label("link_count"))
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    users = [_to_admin_user(user, int(count or 0)) for user, count in rows]
    return users, int(total or 0)


async def _link_count_for(session: AsyncSession, user_id: uuid.UUID) -> int:
    count = await session.scalar(
        select(func.count()).select_from(Link).where(Link.owner_id == user_id)
    )
    return int(count or 0)


async def set_user_active(
    session: AsyncSession,
    redis: Redis,
    *,
    actor: User,
    user_id: uuid.UUID,
    is_active: bool,
    disable_links: bool,
) -> AdminUserRead:
    """Activate/deactivate a user, optionally deactivating all their links too."""
    if user_id == actor.id:
        # Guard against an admin locking themselves out.
        raise NotAuthorizedError("You cannot change your own active status.")

    target = await session.get(User, user_id)
    if target is None:
        raise UserNotFoundError()

    target.is_active = is_active
    if is_active:
        # Reactivating restores login access and clears the self-delete marker. The user's
        # links are intentionally left as they are (a self-delete deactivates them) — the
        # restored user can re-enable whichever links they still want once logged back in.
        target.deleted_at = None

    codes: list[str] = []
    disabled_links = 0
    if disable_links and not is_active:
        codes = list(
            (
                await session.execute(select(Link.code).where(Link.owner_id == user_id))
            ).scalars().all()
        )
        if codes:
            await session.execute(
                update(Link).where(Link.owner_id == user_id).values(is_active=False)
            )
            disabled_links = len(codes)

    await record_audit(
        session,
        actor_id=actor.id,
        action="user.activated" if is_active else "user.deactivated",
        target_type="user",
        target_id=str(user_id),
        detail=(
            f"disabled_links={disabled_links}" if disable_links and not is_active else None
        ),
        commit=False,
    )
    await session.commit()
    await session.refresh(target)

    # Invalidate the redirect cache for any links we just deactivated.
    if disabled_links:
        for code in codes:
            await invalidate_link_cache(redis, code)

    return _to_admin_user(target, await _link_count_for(session, user_id))


async def delete_user(
    session: AsyncSession,
    redis: Redis,
    *,
    actor: User,
    user_id: uuid.UUID,
) -> None:
    """Permanently delete a user and all their data. Admin-only, irreversible.

    This is the hard counterpart to a user's own soft delete (``services.users``): the row
    is removed, cascading to the user's links and their clicks. Audit-log entries authored
    by the removed user are preserved (their ``actor_id`` is set NULL by the FK), so the
    trail — including *this* deletion — survives.
    """
    if user_id == actor.id:
        # Guard against an admin deleting their own account out from under themselves.
        raise NotAuthorizedError("You cannot delete your own account.")

    target = await session.get(User, user_id)
    if target is None:
        raise UserNotFoundError()

    email = target.email
    # Capture link codes before the cascade removes the rows, so we can drop their cache.
    codes = list(
        (
            await session.execute(select(Link.code).where(Link.owner_id == user_id))
        ).scalars().all()
    )

    await session.delete(target)
    await record_audit(
        session,
        actor_id=actor.id,
        action="user.deleted",
        target_type="user",
        target_id=str(user_id),
        detail=f"email={email}",
        commit=False,
    )
    await session.commit()

    # Kill any live sessions and drop the redirect cache for the removed links.
    await revoke_all_refresh_tokens(redis, user_id)
    for code in codes:
        await invalidate_link_cache(redis, code)


# --- Links -----------------------------------------------------------------
def _to_admin_link(link: Link, owner_email: str | None) -> AdminLinkRead:
    base = to_link_read(link, settings.BASE_URL)
    return AdminLinkRead(**base.model_dump(), owner_email=owner_email)


async def list_links(
    session: AsyncSession,
    *,
    q: str | None,
    is_active: bool | None,
    limit: int,
    offset: int,
) -> tuple[list[AdminLinkRead], int]:
    """List all links across users (with owner email), newest first, with filters."""
    filters = []
    if is_active is not None:
        filters.append(Link.is_active == is_active)
    if q:
        pattern = f"%{q}%"
        filters.append(or_(Link.code.ilike(pattern), Link.target_url.ilike(pattern)))

    total = await session.scalar(select(func.count()).select_from(Link).where(*filters))

    rows = (
        await session.execute(
            select(Link, User.email)
            .outerjoin(User, Link.owner_id == User.id)
            .where(*filters)
            .order_by(Link.created_at.desc(), Link.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    links = [_to_admin_link(link, email) for link, email in rows]
    return links, int(total or 0)


async def _get_link(session: AsyncSession, link_id: uuid.UUID) -> Link:
    link = await session.get(Link, link_id)
    if link is None:
        raise LinkNotFoundError()
    return link


async def set_link_active(
    session: AsyncSession,
    redis: Redis,
    *,
    actor: User,
    link_id: uuid.UUID,
    is_active: bool,
) -> AdminLinkRead:
    link = await _get_link(session, link_id)
    link.is_active = is_active
    await record_audit(
        session,
        actor_id=actor.id,
        action="link.activated" if is_active else "link.deactivated",
        target_type="link",
        target_id=str(link_id),
        detail=f"code={link.code}",
        commit=False,
    )
    await session.commit()
    await session.refresh(link)
    await invalidate_link_cache(redis, link.code)

    owner_email = None
    if link.owner_id is not None:
        owner = await session.get(User, link.owner_id)
        owner_email = owner.email if owner is not None else None
    return _to_admin_link(link, owner_email)


async def delete_link(
    session: AsyncSession, redis: Redis, *, actor: User, link_id: uuid.UUID
) -> None:
    link = await _get_link(session, link_id)
    code = link.code
    await session.delete(link)
    await record_audit(
        session,
        actor_id=actor.id,
        action="link.deleted",
        target_type="link",
        target_id=str(link_id),
        detail=f"code={code}",
        commit=False,
    )
    await session.commit()
    await invalidate_link_cache(redis, code)


# --- Stats & audit ---------------------------------------------------------
async def platform_stats(session: AsyncSession) -> AdminStats:
    """Aggregate platform-wide counts and a 30-day daily click timeseries."""
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    dialect = session.get_bind().dialect.name

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

    bucket_col = _bucket_expr(dialect, Click.clicked_at, "day").label("bucket")
    ts_rows = (
        await session.execute(
            select(bucket_col, func.count().label("cnt"))
            .where(Click.clicked_at >= month_ago)
            .group_by(bucket_col)
            .order_by(bucket_col.asc())
        )
    ).all()
    clicks_per_day = [TimeBucket(bucket=row.bucket, count=row.cnt) for row in ts_rows]

    return AdminStats(
        total_users=int(total_users or 0),
        active_users=int(active_users or 0),
        total_links=int(total_links or 0),
        active_links=int(active_links or 0),
        total_clicks=int(total_clicks or 0),
        clicks_last_24h=int(clicks_last_24h or 0),
        new_users_last_7d=int(new_users_last_7d or 0),
        new_links_last_7d=int(new_links_last_7d or 0),
        clicks_per_day=clicks_per_day,
    )


async def list_audit_log(
    session: AsyncSession, *, limit: int, offset: int
) -> tuple[list[AuditRead], int]:
    """List audit-log entries, newest first, with the total count."""
    total = await session.scalar(select(func.count()).select_from(AuditLog))
    rows = (
        await session.execute(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()
    entries = [AuditRead.model_validate(row, from_attributes=True) for row in rows]
    return entries, int(total or 0)
