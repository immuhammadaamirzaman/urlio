"""Admin (superuser-only) endpoints: user/link management, stats, and audit log."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_superuser, get_db, get_pagination, get_redis_dep
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
from app.services import admin as admin_service

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_superuser)],
)


@router.get("/users", response_model=Page[AdminUserRead])
async def list_users(
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
    q: str | None = Query(default=None, max_length=255),
) -> Page[AdminUserRead]:
    users, total = await admin_service.list_users(
        session, q=q.strip() if q else None, limit=pagination.limit, offset=pagination.offset
    )
    return Page[AdminUserRead](
        items=users, total=total, limit=pagination.limit, offset=pagination.offset
    )


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def update_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    actor: User = Depends(get_current_superuser),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> AdminUserRead:
    return await admin_service.set_user_active(
        session,
        redis,
        actor=actor,
        user_id=user_id,
        is_active=data.is_active,
        disable_links=data.disable_links,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    actor: User = Depends(get_current_superuser),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    # Hard delete: removes the user and cascades to their links/clicks. (A user's own
    # /users/me deletion is a soft delete that merely disables the account.)
    await admin_service.delete_user(session, redis, actor=actor, user_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/links", response_model=Page[AdminLinkRead])
async def list_links(
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
    q: str | None = Query(default=None, max_length=255),
    is_active: bool | None = Query(default=None),
) -> Page[AdminLinkRead]:
    links, total = await admin_service.list_links(
        session,
        q=q.strip() if q else None,
        is_active=is_active,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[AdminLinkRead](
        items=links, total=total, limit=pagination.limit, offset=pagination.offset
    )


@router.patch("/links/{link_id}", response_model=AdminLinkRead)
async def update_link(
    link_id: uuid.UUID,
    data: AdminLinkUpdate,
    actor: User = Depends(get_current_superuser),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> AdminLinkRead:
    return await admin_service.set_link_active(
        session, redis, actor=actor, link_id=link_id, is_active=data.is_active
    )


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    link_id: uuid.UUID,
    actor: User = Depends(get_current_superuser),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    await admin_service.delete_link(session, redis, actor=actor, link_id=link_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/stats", response_model=AdminStats)
async def stats(session: AsyncSession = Depends(get_db)) -> AdminStats:
    return await admin_service.platform_stats(session)


@router.get("/audit", response_model=Page[AuditRead])
async def audit_log(
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[AuditRead]:
    entries, total = await admin_service.list_audit_log(
        session, limit=pagination.limit, offset=pagination.offset
    )
    return Page[AuditRead](
        items=entries, total=total, limit=pagination.limit, offset=pagination.offset
    )
