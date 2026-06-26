"""Unit tests for short-code generation and alias validation."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.core.exceptions import InvalidAliasError, ReservedCodeError
from app.services import shortcode


def test_generate_random_code_length_and_alphabet():
    code = shortcode.generate_random_code(7, settings.SHORTCODE_ALPHABET)
    assert len(code) == 7
    assert set(code) <= set(settings.SHORTCODE_ALPHABET)


def test_is_reserved():
    assert shortcode.is_reserved("api")
    assert shortcode.is_reserved("HEALTH")  # case-insensitive
    assert not shortcode.is_reserved("abc123X")


def test_validate_custom_alias_accepts_valid():
    shortcode.validate_custom_alias("mycool")  # no exception
    shortcode.validate_custom_alias("Promo2026")


def test_validate_custom_alias_rejects_short():
    with pytest.raises(InvalidAliasError):
        shortcode.validate_custom_alias("ab")


def test_validate_custom_alias_rejects_bad_charset():
    with pytest.raises(InvalidAliasError):
        shortcode.validate_custom_alias("has space")


def test_validate_custom_alias_rejects_reserved():
    with pytest.raises(ReservedCodeError):
        shortcode.validate_custom_alias("admin")


async def test_generate_unique_code_bumps_length_after_collisions(monkeypatch):
    # Force every length-7 candidate to "collide" so the loop bumps to length 8.
    async def fake_exists(session, redis, code: str) -> bool:
        return len(code) == 7

    monkeypatch.setattr(shortcode, "code_exists", fake_exists)
    code = await shortcode.generate_unique_code(None, None)
    assert len(code) == 8
