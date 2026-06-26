"""Security primitives: password hashing, JWT tokens, link-password grants, IP hashing.

Pure functions only — no database or Redis access lives here. Refresh-token revocation
state is managed in :mod:`app.services.auth` using Redis.
"""

from __future__ import annotations

import contextlib
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings
from app.core.exceptions import InvalidTokenError, TokenExpiredError
from app.schemas.token import TokenPayload

_argon2_hasher = PasswordHasher(
    time_cost=settings.ARGON2_TIME_COST,
    memory_cost=settings.ARGON2_MEMORY_COST,
    parallelism=settings.ARGON2_PARALLELISM,
)

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
# A precomputed argon2 hash used to burn CPU when a user does not exist, so that
# authentication timing does not reveal account existence.
_DUMMY_HASH = _argon2_hasher.hash("shortlyx-timing-equalizer")


def _now() -> datetime:
    return datetime.now(UTC)


# --- Password hashing ------------------------------------------------------
def hash_password(plain: str) -> str:
    """Hash a password with argon2id."""
    return _argon2_hasher.hash(plain)


def verify_password(plain: str, hashed: str | None) -> bool:
    """Verify a password against an argon2id or bcrypt hash (constant-time)."""
    if not hashed:
        return False
    if hashed.startswith("$argon2"):
        try:
            return _argon2_hasher.verify(hashed, plain)
        except (VerifyMismatchError, InvalidHashError):
            return False
    if hashed.startswith(_BCRYPT_PREFIXES):
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False
    return False


def dummy_verify() -> None:
    """Run a verify against a dummy hash to equalize timing for unknown users."""
    with contextlib.suppress(VerifyMismatchError):
        _argon2_hasher.verify(_DUMMY_HASH, "wrong-password")


def needs_rehash(hashed: str) -> bool:
    """Return True if an argon2 hash should be upgraded to current parameters."""
    if not hashed.startswith("$argon2"):
        return True
    try:
        return _argon2_hasher.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


# --- IP hashing ------------------------------------------------------------
def hash_ip(ip: str | None) -> str | None:
    """Return a SHA-256 hex digest of an IP address (never store raw IPs)."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


# --- JWT -------------------------------------------------------------------
def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _base_claims(sub: str, *, token_type: str, expires: datetime, issued: datetime) -> dict:
    return {
        "sub": sub,
        "iat": int(issued.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": secrets.token_urlsafe(16),
        "type": token_type,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    }


def create_access_token(
    user_id: str | uuid.UUID, *, expires_delta: timedelta | None = None
) -> tuple[str, str]:
    """Create a signed access token. Returns ``(token, jti)``."""
    issued = _now()
    expires = issued + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    claims = _base_claims(str(user_id), token_type="access", expires=expires, issued=issued)
    return _encode(claims), claims["jti"]


def create_refresh_token(
    user_id: str | uuid.UUID, *, expires_delta: timedelta | None = None
) -> tuple[str, str]:
    """Create a signed refresh token. Returns ``(token, jti)``."""
    issued = _now()
    expires = issued + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    claims = _base_claims(str(user_id), token_type="refresh", expires=expires, issued=issued)
    return _encode(claims), claims["jti"]


def decode_token(
    token: str, *, expected_type: str | None = None
) -> TokenPayload:
    """Decode and validate a JWT (signature, exp, iss, aud, required claims)."""
    try:
        raw = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError() from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError() from exc

    payload = TokenPayload(**raw)
    if expected_type is not None and payload.type != expected_type:
        raise InvalidTokenError("Unexpected token type.")
    return payload


# --- Link password grants --------------------------------------------------
def create_link_password_grant(code: str) -> str:
    """Issue a short-lived JWT that grants access to a password-protected link."""
    issued = _now()
    expires = issued + timedelta(minutes=settings.LINK_PASSWORD_TOKEN_EXPIRE_MINUTES)
    claims = {
        "sub": code,
        "iat": int(issued.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": secrets.token_urlsafe(12),
        "type": "linkpw",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    }
    return _encode(claims)


def verify_link_password_grant(token: str | None, code: str) -> bool:
    """Return True if ``token`` is a valid, unexpired grant for ``code``."""
    if not token:
        return False
    try:
        raw = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
    except jwt.InvalidTokenError:
        return False
    return raw.get("type") == "linkpw" and raw.get("sub") == code
