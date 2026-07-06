"""Redirect hot-path tests: 307, caching, 404/410, password gating."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.api.redirect import _client_country
from app.core.config import settings
from tests.conftest import API


def _req(**headers):
    return SimpleNamespace(headers=headers)


@pytest.mark.parametrize(
    ("header_name", "value", "expected"),
    [
        ("CF-IPCountry", "us", "US"),  # normalized to uppercase
        ("CF-IPCountry", " de ", "DE"),  # trimmed
        ("CF-IPCountry", "XX", None),  # Cloudflare "unknown" sentinel
        ("CF-IPCountry", "T1", None),  # Tor sentinel (not alpha)
        ("CF-IPCountry", "USA", None),  # not a 2-letter code
        ("CF-IPCountry", "", None),  # empty header
        ("Other-Header", "US", None),  # configured header absent
    ],
)
def test_client_country_normalization(monkeypatch, header_name, value, expected):
    monkeypatch.setattr(settings, "COUNTRY_HEADER", "CF-IPCountry")
    assert _client_country(_req(**{header_name: value})) == expected


def test_client_country_disabled_by_default(monkeypatch):
    monkeypatch.setattr(settings, "COUNTRY_HEADER", "")
    assert _client_country(_req(**{"CF-IPCountry": "US"})) is None


async def _create(client, **payload):
    resp = await client.post(
        f"{API}/links",
        json={"target_url": "https://example.com/dest", **payload},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_redirect_307_to_target(client):
    link = await _create(client)
    resp = await client.get(f"/{link['code']}")
    assert resp.status_code == 307
    assert resp.headers["location"] == "https://example.com/dest"


async def test_redirect_uses_cache(client, fake_redis):
    link = await _create(client)
    await client.get(f"/{link['code']}")
    assert await fake_redis.exists(f"link:{link['code']}")


async def test_unknown_code_404_and_negative_cache(client, fake_redis):
    resp = await client.get("/doesnotexist1")
    assert resp.status_code == 404
    assert await fake_redis.exists("link:miss:doesnotexist1")


async def test_expired_link_returns_410(client):
    link = await _create(client, expires_at="2000-01-01T00:00:00Z")
    resp = await client.get(f"/{link['code']}")
    assert resp.status_code == 410
    assert resp.json()["error"]["code"] == "link_expired"


async def test_inactive_link_returns_404(client, register_and_login):
    headers, _ = await register_and_login(email="redir@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/dest"}
    )
    link = created.json()
    await client.patch(
        f"{API}/links/{link['id']}", headers=headers, json={"is_active": False}
    )
    resp = await client.get(f"/{link['code']}")
    assert resp.status_code == 404


async def test_password_protected_flow(client):
    link = await _create(client, password="s3cret")

    # Without a grant the redirect is gated.
    gated = await client.get(f"/{link['code']}")
    assert gated.status_code == 401
    assert gated.json()["error"]["code"] == "link_password_required"

    # Wrong password is rejected.
    wrong = await client.post(f"/{link['code']}", json={"password": "nope"})
    assert wrong.status_code == 401
    assert wrong.json()["error"]["code"] == "invalid_link_password"

    # Correct password redirects and issues a grant cookie.
    ok = await client.post(f"/{link['code']}", json={"password": "s3cret"})
    assert ok.status_code == 307
    assert ok.headers["location"] == "https://example.com/dest"
    assert f"linkpw_{link['code']}" in ok.headers.get("set-cookie", "")
