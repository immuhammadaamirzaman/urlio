"""JWT token schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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


class TokenRequest(BaseModel):
    """Body carrying a single-use action token (verify-email, confirm-email-change)."""

    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


TokenType = Literal[
    "access",
    "refresh",
    "linkpw",
    "verify_email",
    "reset_password",
    "email_change",
]


class TokenPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str
    exp: int
    iat: int
    jti: str
    type: TokenType
    iss: str | None = None
    aud: str | None = None
    # Carried only by "email_change" tokens: the address the user wants to switch to.
    email: str | None = None
    # Carried by access tokens: the id of the session (the refresh-token jti) that minted
    # this access token, so a revoked session immediately invalidates its access tokens.
    sid: str | None = None
