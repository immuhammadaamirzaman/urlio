"""Rate-limiting tests."""

from __future__ import annotations

import pytest

from app.core.config import settings
from tests.conftest import API


@pytest.fixture
def low_anon_limit(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANON_PER_MINUTE", 2)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANON_WINDOW_SECONDS", 60)


async def test_anonymous_rate_limit_trips_429(client, low_anon_limit):
    payload = {"target_url": "https://example.com/x"}

    first = await client.post(f"{API}/links", json=payload)
    second = await client.post(f"{API}/links", json=payload)
    third = await client.post(f"{API}/links", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert third.status_code == 429

    body = third.json()
    assert body["error"]["code"] == "rate_limited"
    assert third.headers["X-RateLimit-Limit"] == "2"
    assert "X-RateLimit-Remaining" in third.headers
    assert "X-RateLimit-Reset" in third.headers
    assert "Retry-After" in third.headers
