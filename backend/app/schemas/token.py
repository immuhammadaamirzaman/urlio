"""JWT token schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class SessionRead(BaseModel):
    """One active refresh-token session. ``jti`` identifies it for revocation; a client
    can spot its own session by base64-decoding its refresh token's payload."""

    jti: str
    created_at: datetime | None
    refreshed_at: datetime | None
    user_agent: str | None


class AccessToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str
    exp: int
    iat: int
    jti: str
    type: Literal["access", "refresh", "linkpw"]
    iss: str | None = None
    aud: str | None = None
