"""Unit tests for client IP resolution (X-Forwarded-For trusted-proxy handling)."""

from __future__ import annotations

import pytest

from app.api.deps import resolve_client_ip
from app.core.config import settings
from tests.conftest import API

# The httpx ASGITransport reports this as the socket peer for in-process requests.
TEST_PEER = "127.0.0.1"


def test_missing_peer_returns_unknown():
    assert resolve_client_ip(None, "203.0.113.7", ["203.0.113.0/24"]) == "unknown"
    assert resolve_client_ip("", None, []) == "unknown"


def test_no_trusted_proxies_ignores_spoofed_xff():
    assert resolve_client_ip("198.51.100.9", "1.2.3.4", []) == "198.51.100.9"


def test_untrusted_peer_ignores_xff():
    assert resolve_client_ip("198.51.100.9", "1.2.3.4", ["10.0.0.1"]) == "198.51.100.9"


def test_trusted_peer_single_hop_returns_hop():
    assert resolve_client_ip("10.0.0.1", "203.0.113.7", ["10.0.0.1"]) == "203.0.113.7"


def test_spoofed_leading_hop_returns_rightmost_untrusted():
    # The client sent "X-Forwarded-For: 1.2.3.4" and the proxy appended the real IP.
    assert (
        resolve_client_ip("10.0.0.1", "1.2.3.4, 203.0.113.7", ["10.0.0.1"])
        == "203.0.113.7"
    )


def test_chain_of_trusted_proxies_skipped_right_to_left():
    assert (
        resolve_client_ip(
            "10.0.0.1", "203.0.113.7, 10.0.0.2, 10.0.0.3", ["10.0.0.0/24"]
        )
        == "203.0.113.7"
    )


def test_all_hops_trusted_returns_peer():
    assert resolve_client_ip("10.0.0.1", "10.0.0.2, 10.0.0.3", ["10.0.0.0/24"]) == "10.0.0.1"


def test_missing_or_empty_xff_returns_trusted_peer():
    assert resolve_client_ip("10.0.0.1", None, ["10.0.0.1"]) == "10.0.0.1"
    assert resolve_client_ip("10.0.0.1", " , ,", ["10.0.0.1"]) == "10.0.0.1"


def test_cidr_entry_matches_peer():
    assert resolve_client_ip("172.16.5.20", "203.0.113.7", ["172.16.0.0/12"]) == "203.0.113.7"


def test_ipv6_peer_and_hops():
    assert resolve_client_ip("::1", "2001:db8::5", ["::1"]) == "2001:db8::5"
    assert (
        resolve_client_ip("fd00::1", "2001:db8::5, fd00::2", ["fd00::/8"]) == "2001:db8::5"
    )


def test_unparseable_trusted_entry_never_matches():
    # A bad config entry must not accidentally trust anyone (XFF stays ignored).
    assert resolve_client_ip("10.0.0.1", "1.2.3.4", ["not-an-ip"]) == "10.0.0.1"
    # ...but valid entries alongside it still work.
    assert resolve_client_ip("10.0.0.1", "1.2.3.4", ["not-an-ip", "10.0.0.1"]) == "1.2.3.4"


def test_garbage_hop_counts_as_untrusted():
    # Unparseable hops are returned as-is rather than skipped to a spoofable one.
    assert (
        resolve_client_ip("10.0.0.1", "1.2.3.4, [::1]:8080", ["10.0.0.1"]) == "[::1]:8080"
    )


@pytest.fixture
def low_anon_limit(monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANON_PER_MINUTE", 1)
    monkeypatch.setattr(settings, "RATE_LIMIT_ANON_WINDOW_SECONDS", 60)


async def test_spoofed_xff_cannot_bypass_rate_limit(client, low_anon_limit, monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", [])
    payload = {"target_url": "https://example.com/x"}

    first = await client.post(f"{API}/links", json=payload, headers={"x-forwarded-for": "1.1.1.1"})
    second = await client.post(f"{API}/links", json=payload, headers={"x-forwarded-for": "2.2.2.2"})

    assert first.status_code == 201
    assert second.status_code == 429  # both counted against the socket peer


async def test_xff_honored_behind_trusted_proxy(client, low_anon_limit, monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", [TEST_PEER])
    payload = {"target_url": "https://example.com/x"}

    first = await client.post(f"{API}/links", json=payload, headers={"x-forwarded-for": "1.1.1.1"})
    second = await client.post(f"{API}/links", json=payload, headers={"x-forwarded-for": "2.2.2.2"})
    third = await client.post(f"{API}/links", json=payload, headers={"x-forwarded-for": "1.1.1.1"})

    assert first.status_code == 201
    assert second.status_code == 201  # distinct forwarded clients get separate buckets
    assert third.status_code == 429  # repeat forwarded client trips its own limit
