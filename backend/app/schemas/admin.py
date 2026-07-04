"""Admin-facing schemas (moderation, stats, audit log)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.analytics import TimeBucket
from app.schemas.common import ORMBase
from app.schemas.link import LinkRead


class AdminUserRead(ORMBase):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None
    is_active: bool
    is_superuser: bool
    email_verified: bool
    link_count: int
    created_at: datetime


class AdminUserUpdate(BaseModel):
    is_active: bool
    # When deactivating: also force-disable every link the user owns.
    disable_links: bool = False


class AdminLinkRead(LinkRead):
    owner_email: EmailStr | None = None


class AdminLinkUpdate(BaseModel):
    is_active: bool


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


class AuditRead(ORMBase):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    target_type: str
    target_id: str
    detail: str | None
    created_at: datetime
