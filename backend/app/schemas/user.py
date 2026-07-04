"""User-facing schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMBase


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
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    # Required by the service whenever ``password`` is set (re-auth for a sensitive change).
    current_password: str | None = Field(default=None)


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
