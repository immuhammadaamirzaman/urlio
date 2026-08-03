"""One-time encrypted secret share endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Union

from app.api.deps import get_db, get_optional_user, get_redis_dep, rate_limit
from app.models.user import User
from app.schemas.secret import (
    SecretCreate,
    SecretOpenResponse,
    SecretShareResponse,
    SecretPreviewResponse,
)
from app.services.secrets import create_secret_share, open_secret_share, _aware_utc
from app.models.secret import SecretShare
from app.core.exceptions import SecretShareNotFoundError, SecretShareExpiredError

router = APIRouter(prefix="/secrets", tags=["secrets"])


@router.post(
    "",
    response_model=SecretShareResponse,
    dependencies=[Depends(rate_limit("auth"))],
)
async def create_secret_share_endpoint(
    data: SecretCreate,
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
    user: User | None = Depends(get_optional_user),
) -> SecretShareResponse:
    _ = user
    share = await create_secret_share(
        session,
        data.secret,
        expires_in_seconds=data.expires_in_seconds,
    )
    return SecretShareResponse(token=share.token, expires_at=share.expires_at)


@router.get(
    "/{token}",
    dependencies=[Depends(rate_limit("redirect"))],
)
async def get_secret_share_endpoint(
    token: str,
    reveal: bool = Query(False),
    session: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_dep),
) -> Union[SecretOpenResponse, SecretPreviewResponse]:
    """Get secret share with optional reveal.

    - Without ?reveal=true: Returns preview metadata only (non-consuming, safe for bots)
    - With ?reveal=true: Returns full secret and marks as consumed (single-use)

    This design allows normal GET requests to work intuitively while preventing
    accidental consumption by link unfurlers and bots.
    """
    if reveal:
        # User wants to reveal/consume the secret
        secret, expires_at = await open_secret_share(session, redis, token)
        return SecretOpenResponse(secret=secret, expires_at=expires_at)
    else:
        # Preview only (non-consuming, safe for bots and link unfurlers)
        now = datetime.now().astimezone()
        share = await session.scalar(select(SecretShare).where(SecretShare.token == token))
        if share is None:
            raise SecretShareNotFoundError()

        if _aware_utc(share.expires_at) is not None and _aware_utc(share.expires_at) < _aware_utc(now):
            raise SecretShareExpiredError()

        consumed = share.consumed_at is not None
        return SecretPreviewResponse(consumed=consumed, expires_at=share.expires_at)


