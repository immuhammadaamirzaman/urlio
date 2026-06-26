"""Link schemas. Target-URL validation/normalization is done in the service layer
(``app.core.url_validation``) so SSRF logic stays centralized — here we only enforce
basic shape."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMBase


class LinkCreate(BaseModel):
    target_url: str = Field(max_length=2048)
    custom_alias: str | None = Field(default=None, min_length=3, max_length=64)
    expires_at: datetime | None = None
    password: str | None = Field(default=None, min_length=1, max_length=128)

    @field_validator("target_url")
    @classmethod
    def _non_empty_url(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("target_url must not be empty")
        return v.strip()


class LinkUpdate(BaseModel):
    target_url: str | None = Field(default=None, max_length=2048)
    is_active: bool | None = None
    expires_at: datetime | None = None
    # "" removes the password, a value sets it, None leaves it unchanged.
    password: str | None = Field(default=None, max_length=128)


class LinkRead(ORMBase):
    id: uuid.UUID
    code: str
    short_url: str
    target_url: str
    owner_id: uuid.UUID | None
    is_custom_alias: bool
    is_active: bool
    has_password: bool
    expires_at: datetime | None
    click_count: int
    last_clicked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LinkResolve(BaseModel):
    """Internal cache payload (serialized to Redis JSON)."""

    code: str
    target_url: str
    is_active: bool
    has_password: bool
    expires_at: datetime | None
    link_id: uuid.UUID


class PasswordSubmit(BaseModel):
    password: str = Field(min_length=1, max_length=128)
