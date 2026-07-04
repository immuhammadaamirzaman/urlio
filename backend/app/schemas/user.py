"""User-facing schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

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
    current_password: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def _password_change_needs_current(self) -> UserUpdate:
        if self.password and not self.current_password:
            raise ValueError("current_password is required to change the password")
        return self


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)


class EmailChangeRequest(BaseModel):
    new_email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ConfirmEmailChangeRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256)
