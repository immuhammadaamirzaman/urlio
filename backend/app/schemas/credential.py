"""Pydantic schemas for the credential vault feature."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator


class CredentialCreate(BaseModel):
    master_password: str = Field(min_length=8, max_length=128)
    username_or_email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)
    detail: str = Field(min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=2048)


class CredentialCreateResponse(BaseModel):
    id: uuid.UUID
    detail: str
    created_at: datetime


class CredentialListItem(BaseModel):
    id: uuid.UUID
    detail: str
    created_at: datetime
    updated_at: datetime


class CredentialListResponse(BaseModel):
    items: list[CredentialListItem]
    total: int
    limit: int
    offset: int


class CredentialDecryptRequest(BaseModel):
    master_password: str = Field(min_length=1)


class CredentialDecryptResponse(BaseModel):
    id: uuid.UUID
    username_or_email: str
    password: str
    detail: str
    url: str | None


class CredentialUpdate(BaseModel):
    master_password: str = Field(min_length=1)
    username_or_email: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1, max_length=1024)
    detail: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def at_least_one_field(self) -> Self:
        """Ensure at least one updatable field is provided."""
        if (
            self.username_or_email is None
            and self.password is None
            and self.detail is None
            and self.url is None
        ):
            raise ValueError("At least one field to update is required")
        return self


class CredentialUpdateResponse(BaseModel):
    id: uuid.UUID
    detail: str
    updated_at: datetime


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordResponse(BaseModel):
    id: uuid.UUID
    updated_at: datetime


class BulkDecryptRequest(BaseModel):
    master_password: str = Field(min_length=1)
    credential_ids: list[uuid.UUID] | None = Field(default=None, max_length=100)


class BulkDecryptFailure(BaseModel):
    id: uuid.UUID
    error: str


class BulkDecryptResponse(BaseModel):
    successes: list[CredentialDecryptResponse]
    failures: list[BulkDecryptFailure]
    success_count: int
    failure_count: int
