"""Owner-scoped analytics endpoints for a link."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_pagination, get_redis_dep
from app.models.user import User
from app.schemas.analytics import ClickRead, LinkStats
from app.schemas.common import Page, PaginationParams
from app.services.analytics import get_link_stats, list_clicks
from app.services.links import get_link_for_owner

router = APIRouter(prefix="/links", tags=["analytics"])


@router.get("/{link_id}/stats", response_model=LinkStats)
async def link_stats(
    link_id: uuid.UUID,
    bucket: Literal["day", "hour"] = Query(default="day"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> LinkStats:
    link = await get_link_for_owner(session, link_id, user.id)
    return await get_link_stats(session, redis, link, bucket=bucket)


@router.get("/{link_id}/clicks", response_model=Page[ClickRead])
async def link_clicks(
    link_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[ClickRead]:
    link = await get_link_for_owner(session, link_id, user.id)
    rows, total = await list_clicks(
        session, link.id, limit=pagination.limit, offset=pagination.offset
    )
    return Page[ClickRead](
        items=[ClickRead.model_validate(row) for row in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )
