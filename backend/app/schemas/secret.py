"""Schemas for creating and opening one-time encrypted secret shares."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SecretCreate(BaseModel):
    secret: str = Field(min_length=1, max_length=8192)
    expires_in_seconds: int = Field(default=900, ge=60, le=86400)


class SecretShareResponse(BaseModel):
    token: str
    expires_at: datetime


class SecretOpenResponse(BaseModel):
    secret: str
    expires_at: datetime


class SecretPreviewResponse(BaseModel):
    """Non-consuming preview of a secret share for link unfurling / previews.

    `consumed` is True if the secret has already been opened. This response does NOT
    reveal the secret contents.
    """
    consumed: bool
    expires_at: datetime

