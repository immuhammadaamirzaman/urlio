"""User profile operations."""

from __future__ import annotations

import uuid

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import click_count_key, redis_await
from app.core.exceptions import InvalidCurrentPasswordError, UserNotFoundError
from app.core.security import hash_password, verify_password
from app.models.link import Link
from app.models.user import User
from app.schemas.user import UserUpdate
from app.services.auth import revoke_all_refresh_tokens
from app.services.links import invalidate_link_cache


async def get_profile(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


async def update_profile(
    session: AsyncSession, redis: Redis, user: User, data: UserUpdate
) -> User:
    """Update display name and/or password; only set fields are changed.

    Changing the password requires the correct current password and revokes every
    refresh token, so a stolen session cannot survive a password rotation. The
    caller's access token stays valid until it expires; clients should re-login.
    """
    fields = data.model_dump(exclude_unset=True)
    if "display_name" in fields:
        user.display_name = fields["display_name"]

    password_changed = False
    if fields.get("password"):
        if not await verify_password(
            fields.get("current_password") or "", user.hashed_password
        ):
            raise InvalidCurrentPasswordError()
        user.hashed_password = await hash_password(fields["password"])
        password_changed = True

    await session.commit()
    await session.refresh(user)

    if password_changed:
        await revoke_all_refresh_tokens(redis, user.id)
    return user


async def delete_account(
    session: AsyncSession, redis: Redis, user: User, password: str
) -> None:
    """Permanently delete an account after password confirmation.

    Owned links and their click history are cascade-deleted; every refresh token is
    revoked and the deleted links' cache entries and click counters are purged so the
    short codes stop resolving immediately.
    """
    if not await verify_password(password, user.hashed_password):
        raise InvalidCurrentPasswordError()

    owned = (
        await session.execute(select(Link.id, Link.code).where(Link.owner_id == user.id))
    ).all()

    user_id = user.id
    await session.delete(user)
    await session.commit()

    await revoke_all_refresh_tokens(redis, user_id)
    for link_id, code in owned:
        await invalidate_link_cache(redis, code)
        await redis_await(redis.delete(click_count_key(link_id)))
