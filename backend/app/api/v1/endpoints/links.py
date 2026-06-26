"""Link management endpoints (create is anonymous-friendly; the rest are owner-scoped)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    get_db,
    get_optional_user,
    get_pagination,
    get_redis_dep,
    rate_limit,
)
from app.core.config import settings
from app.models.user import User
from app.schemas.common import Page, PaginationParams
from app.schemas.link import LinkCreate, LinkRead, LinkUpdate
from app.services.links import (
    create_link,
    delete_link,
    get_link_for_owner,
    list_links,
    to_link_read,
    update_link,
)

router = APIRouter(prefix="/links", tags=["links"])


@router.post(
    "",
    response_model=LinkRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("anon"))],
)
async def create(
    data: LinkCreate,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User | None = Depends(get_optional_user),
) -> LinkRead:
    owner_id = user.id if user is not None else None
    link = await create_link(session, redis, data, owner_id)
    return to_link_read(link, settings.BASE_URL)


@router.get("", response_model=Page[LinkRead])
async def list_my_links(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[LinkRead]:
    rows, total = await list_links(
        session,
        user.id,
        limit=pagination.limit,
        offset=pagination.offset,
        cursor=pagination.cursor,
    )
    return Page[LinkRead](
        items=[to_link_read(link, settings.BASE_URL) for link in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{link_id}", response_model=LinkRead)
async def get_one(
    link_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> LinkRead:
    link = await get_link_for_owner(session, link_id, user.id)
    return to_link_read(link, settings.BASE_URL)


@router.patch("/{link_id}", response_model=LinkRead)
async def update_one(
    link_id: uuid.UUID,
    data: LinkUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> LinkRead:
    link = await get_link_for_owner(session, link_id, user.id)
    link = await update_link(session, redis, link, data)
    return to_link_read(link, settings.BASE_URL)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_one(
    link_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Response:
    link = await get_link_for_owner(session, link_id, user.id)
    await delete_link(session, redis, link)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
