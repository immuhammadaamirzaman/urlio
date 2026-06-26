"""User profile operations."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UserNotFoundError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserUpdate


async def get_profile(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


async def update_profile(session: AsyncSession, user: User, data: UserUpdate) -> User:
    """Update display name and/or password; only set fields are changed."""
    fields = data.model_dump(exclude_unset=True)
    if "display_name" in fields:
        user.display_name = fields["display_name"]
    if "password" in fields and fields["password"]:
        user.hashed_password = hash_password(fields["password"])

    await session.commit()
    await session.refresh(user)
    return user
