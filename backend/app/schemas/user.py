"""User-facing schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMBase

ThemeMode = Literal["light", "dark", "system"]
# A named preset key ("blue", "violet", …) or a "#rrggbb" custom colour.
ACCENT_PATTERN = r"^(#[0-9a-fA-F]{6}|[a-z]{2,20})$"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=100)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(ORMBase):
    id: uuid.UUID
    email: EmailStr
    display_name: str | None
    is_active: bool
    is_superuser: bool
    email_verified: bool
    theme: str
    accent: str
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    # Required by the service whenever ``password`` is set (re-auth for a sensitive change).
    current_password: str | None = Field(default=None)
    theme: ThemeMode | None = Field(default=None)
    accent: str | None = Field(default=None, max_length=32, pattern=ACCENT_PATTERN)


class PasswordConfirm(BaseModel):
    """Body for password-confirmed sensitive actions (e.g. account deletion)."""

    password: str


class EmailChangeRequest(BaseModel):
    new_email: EmailStr
    password: str


class SessionRead(BaseModel):
    jti: str
    created_at: datetime | None = None
    refreshed_at: datetime | None = None
    user_agent: str | None = None
