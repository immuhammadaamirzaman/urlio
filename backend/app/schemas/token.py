"""JWT token schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


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
