"""Schemas for creating and opening one-time encrypted secret shares."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SecretCreate(BaseModel):
    secret: str = Field(min_length=1, max_length=8192)
    expires_in_seconds: int = Field(default=900, ge=60, le=86400)
    require_auth: bool = Field(
        default=False,
        description=(
            "Require the reader to be signed in before the secret can be opened. "
            "Defaults to False: anyone holding the link may open it once."
        ),
    )


class SecretShareResponse(BaseModel):
    token: str
    expires_at: datetime
    require_auth: bool = False


class SecretOpenResponse(BaseModel):
    secret: str
    expires_at: datetime


class SecretPreviewResponse(BaseModel):
    """Non-consuming preview of a secret share for link unfurling / previews.

    `consumed` is True if the secret has already been opened. This response does NOT
    reveal the secret contents.

    `require_auth` is reported to anonymous callers on purpose, and is the reason this
    endpoint stays open: the reader has to be able to learn that a sign-in is needed
    *before* attempting the one reveal the share allows.
    """
    consumed: bool
    expires_at: datetime
    require_auth: bool = False

