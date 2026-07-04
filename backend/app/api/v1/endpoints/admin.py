"""Admin endpoints: user moderation, link takedowns, platform stats, audit log.

Every route requires a superuser (router-level dependency); non-admins get 403.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db, get_pagination, get_redis_dep
from app.core.config import settings
from app.models.link import Link
from app.models.user import User
from app.schemas.admin import (
    AdminLinkRead,
    AdminLinkUpdate,
    AdminStats,
    AdminUserRead,
    AdminUserUpdate,
    AuditRead,
)
from app.schemas.common import Page, PaginationParams
from app.services.admin import (
    admin_delete_link,
    admin_set_link_active,
    get_global_stats,
    get_link_or_404,
    get_user_or_404,
    list_audit,
    search_links,
    search_users,
    set_user_active,
)
from app.services.links import to_link_read

router = APIRouter(
    prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)]
)


def _to_admin_user(user: User, link_count: int) -> AdminUserRead:
    return AdminUserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_superuser=user.is_superuser,
        email_verified=user.email_verified,
        link_count=link_count,
        created_at=user.created_at,
    )


def _to_admin_link(link: Link, owner_email: str | None) -> AdminLinkRead:
    base = to_link_read(link, settings.BASE_URL)
    return AdminLinkRead(**base.model_dump(), owner_email=owner_email)


# --- Users ---------------------------------------------------------------------
@router.get("/users", response_model=Page[AdminUserRead])
async def admin_list_users(
    q: str | None = Query(default=None, max_length=320),
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[AdminUserRead]:
    rows, total = await search_users(
        session, q=q, limit=pagination.limit, offset=pagination.offset
    )
    return Page[AdminUserRead](
        items=[_to_admin_user(user, count) for user, count in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def admin_update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> AdminUserRead:
    target = await get_user_or_404(session, user_id)
    updated = await set_user_active(
        session,
        redis,
        actor=admin,
        target=target,
        is_active=data.is_active,
        disable_links=data.disable_links,
    )
    link_count = await session.scalar(
        select(func.count()).select_from(Link).where(Link.owner_id == updated.id)
    )
    return _to_admin_user(updated, int(link_count or 0))


# --- Links ---------------------------------------------------------------------
@router.get("/links", response_model=Page[AdminLinkRead])
async def admin_list_links(
    q: str | None = Query(default=None, max_length=2048),
    owner_id: uuid.UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[AdminLinkRead]:
    rows, total = await search_links(
        session,
        q=q,
        owner_id=owner_id,
        is_active=is_active,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[AdminLinkRead](
        items=[_to_admin_link(link, email) for link, email in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.patch("/links/{link_id}", response_model=AdminLinkRead)
async def admin_update_link(
    link_id: uuid.UUID,
    data: AdminLinkUpdate,
    admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> AdminLinkRead:
    link = await get_link_or_404(session, link_id)
    updated = await admin_set_link_active(
        session, redis, actor=admin, link=link, is_active=data.is_active
    )
    owner_email = None
    if updated.owner_id is not None:
        owner_email = await session.scalar(
            select(User.email).where(User.id == updated.owner_id)
        )
    return _to_admin_link(updated, owner_email)


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_remove_link(
    link_id: uuid.UUID,
    admin: User = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    link = await get_link_or_404(session, link_id)
    await admin_delete_link(session, redis, actor=admin, link=link)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Stats / audit ----------------------------------------------------------------
@router.get("/stats", response_model=AdminStats)
async def admin_stats(session: AsyncSession = Depends(get_db)) -> AdminStats:
    return await get_global_stats(session)


@router.get("/audit", response_model=Page[AuditRead])
async def admin_audit_log(
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[AuditRead]:
    rows, total = await list_audit(
        session, limit=pagination.limit, offset=pagination.offset
    )
    return Page[AuditRead](
        items=[AuditRead.model_validate(row) for row in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
