"""Unit tests for the Settings security validators.

Settings is constructed directly with keyword arguments (and ``_env_file=None``) so the
values under test override both the developer's `.env` and the env vars conftest sets.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings

# Any value comfortably past the 32-char minimum (43 chars, like token_urlsafe(32)).
STRONG_SECRET = "s" * 43


def test_production_rejects_default_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(
            _env_file=None,
            ENVIRONMENT="production",
            SECRET_KEY="CHANGE_ME_DEV_SECRET_NOT_FOR_PROD",
        )


def test_production_rejects_short_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(_env_file=None, ENVIRONMENT="production", SECRET_KEY="short-secret")


def test_production_accepts_strong_secret_key():
    s = Settings(
        _env_file=None,
        ENVIRONMENT="production",
        SECRET_KEY=STRONG_SECRET,
        CORS_ORIGINS=["https://app.example.com"],
    )
    assert s.is_production
    assert s.SECRET_KEY == STRONG_SECRET


def test_credentialed_cors_rejects_wildcard_origin():
    # Rejected regardless of environment, including development.
    with pytest.raises(ValidationError, match="CORS_ALLOW_CREDENTIALS"):
        Settings(
            _env_file=None,
            ENVIRONMENT="development",
            CORS_ALLOW_CREDENTIALS=True,
            CORS_ORIGINS=["*"],
        )


def test_credentialed_cors_accepts_explicit_origins():
    s = Settings(
        _env_file=None,
        ENVIRONMENT="development",
        CORS_ALLOW_CREDENTIALS=True,
        CORS_ORIGINS=["https://app.example.com"],
    )
    assert s.CORS_ALLOW_CREDENTIALS
    assert s.CORS_ORIGINS == ["https://app.example.com"]


def test_development_defaults_construct_fine():
    s = Settings(
        _env_file=None,
        ENVIRONMENT="development",
        SECRET_KEY="CHANGE_ME_DEV_SECRET_NOT_FOR_PROD",
        CORS_ORIGINS=["*"],
        CORS_ALLOW_CREDENTIALS=False,
    )
    assert not s.is_production
