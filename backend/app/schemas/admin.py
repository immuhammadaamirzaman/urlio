"""Admin-facing schemas (superuser-only endpoints)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.analytics import TimeBucket
from app.schemas.link import LinkRead


class AdminUserRead(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None
    is_active: bool
    is_superuser: bool
    email_verified: bool
    # Set when the user soft-deleted their own account (inactive + deleted). None for a
    # normal account or one an admin merely suspended.
    deleted_at: datetime | None = None
    link_count: int
    created_at: datetime


class AdminUserUpdate(BaseModel):
    is_active: bool
    # When deactivating, optionally also deactivate all of the user's links.
    disable_links: bool = False


class AdminLinkUpdate(BaseModel):
    is_active: bool


class AdminLinkRead(LinkRead):
    owner_email: str | None = None


class AdminStats(BaseModel):
    total_users: int
    active_users: int
    total_links: int
    active_links: int
    total_clicks: int
    clicks_last_24h: int
    new_users_last_7d: int
    new_links_last_7d: int
    clicks_per_day: list[TimeBucket]


class AuditRead(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    target_type: str
    target_id: str
    detail: str | None
    created_at: datetime
