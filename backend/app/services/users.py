"""User profile operations."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidPasswordError, UserNotFoundError
from app.core.security import hash_password, verify_password
from app.models.link import Link
from app.models.user import User
from app.schemas.user import UserUpdate
from app.services.email import send_account_closed_email
from app.services.links import invalidate_link_cache


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

    if "theme" in fields:
        user.theme = fields["theme"]

    if "accent" in fields:
        user.accent = fields["accent"]

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


async def delete_account(
    session: AsyncSession, redis: Redis, user: User, password: str
) -> None:
    """Soft-delete the account after re-auth.

    Rather than removing the row (which would erase the user's data), the account is
    *disabled*: ``is_active`` is flipped off and ``deleted_at`` is stamped, which locks the
    user out of every flow (login, refresh, password reset, token resolution all reject an
    inactive user). Their short links are deactivated too — so the URLs stop resolving, as
    they did under the old hard delete — but the underlying rows are retained. A superuser
    can still remove the account for real via the admin endpoint.
    """
    if not await verify_password(password, user.hashed_password):
        raise InvalidPasswordError()

    user.is_active = False
    user.deleted_at = datetime.now(UTC)

    # Deactivate the user's links so their short URLs stop redirecting, mirroring the
    # user-facing effect of the previous hard delete (which cascaded the links away).
    codes = list(
        (
            await session.execute(select(Link.code).where(Link.owner_id == user.id))
        ).scalars().all()
    )
    if codes:
        await session.execute(
            update(Link).where(Link.owner_id == user.id).values(is_active=False)
        )

    await session.commit()

    for code in codes:
        await invalidate_link_cache(redis, code)

    # Confirm the closure to the user (best-effort; a mail failure never blocks deletion).
    await send_account_closed_email(user.email)
