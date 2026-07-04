"""User profile operations."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidPasswordError, UserNotFoundError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.user import UserUpdate


async def get_profile(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


async def update_profile(
    session: AsyncSession, user: User, data: UserUpdate
) -> tuple[User, bool]:
    """Update display name and/or password; only set fields are changed.

    Changing the password requires the correct ``current_password`` (re-auth). Returns
    ``(user, password_changed)`` so the caller can revoke sessions on a password change.
    """
    fields = data.model_dump(exclude_unset=True)
    password_changed = False

    if "display_name" in fields:
        user.display_name = fields["display_name"]

    if fields.get("password"):
        if not await verify_password(
            fields.get("current_password") or "", user.hashed_password
        ):
            raise InvalidPasswordError("Current password is incorrect.")
        user.hashed_password = await hash_password(fields["password"])
        password_changed = True

    await session.commit()
    await session.refresh(user)
    return user, password_changed


async def delete_account(session: AsyncSession, user: User, password: str) -> None:
    """Permanently delete the account (and its links, via cascade) after re-auth."""
    if not await verify_password(password, user.hashed_password):
        raise InvalidPasswordError()
    await session.delete(user)
    await session.commit()
