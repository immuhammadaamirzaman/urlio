from __future__ import annotations

import asyncio

import pytest

API = "/api/v1"


@pytest.mark.asyncio
async def test_create_secret_without_login_is_allowed(client):
    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "anonymous-secret", "expires_in_seconds": 60},
    )

    assert create_resp.status_code == 200
    payload = create_resp.json()
    assert payload["token"]
    assert payload["expires_at"]


@pytest.mark.asyncio
async def test_create_and_open_secret_once(client, register_and_login):
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "super-secret-value", "expires_in_seconds": 60},
        headers=headers,
    )

    assert create_resp.status_code == 200
    payload = create_resp.json()
    assert payload["token"]
    assert payload["expires_at"]

    token = payload["token"]

    # Preview without reveal (non-consuming)
    preview_resp = await client.get(f"{API}/secrets/{token}")
    assert preview_resp.status_code == 200
    assert preview_resp.json()["consumed"] is False

    # Open secret with reveal=true (consuming)
    open_resp = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert open_resp.status_code == 200
    assert open_resp.json()["secret"] == "super-secret-value"

    # Second access should be consumed
    second_open = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert second_open.status_code == 409
    assert second_open.json()["error"]["code"] == "secret_already_consumed"


@pytest.mark.asyncio
async def test_concurrent_opens_only_one_succeeds(client, register_and_login):
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "race-condition-secret", "expires_in_seconds": 60},
        headers=headers,
    )
    assert create_resp.status_code == 200
    token = create_resp.json()["token"]

    first_resp, second_resp = await asyncio.gather(
        client.get(f"{API}/secrets/{token}?reveal=true"),
        client.get(f"{API}/secrets/{token}?reveal=true"),
    )

    statuses = {resp.status_code for resp in (first_resp, second_resp)}
    assert statuses == {200, 409}
    assert sum(1 for resp in (first_resp, second_resp) if resp.status_code == 200) == 1


@pytest.mark.asyncio
async def test_expired_secret_returns_expired_error(client, register_and_login):
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "expire-me", "expires_in_seconds": 60},
        headers=headers,
    )
    assert create_resp.status_code == 200
    token = create_resp.json()["token"]

    await asyncio.sleep(61)

    open_resp = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert open_resp.status_code == 410
    assert open_resp.json()["error"]["code"] == "secret_expired"


@pytest.mark.asyncio
async def test_preview_without_reveal_is_non_consuming(client, register_and_login):
    """Verify that GET without ?reveal=true doesn't consume the secret."""
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "preview-test-secret", "expires_in_seconds": 60},
        headers=headers,
    )
    assert create_resp.status_code == 200
    token = create_resp.json()["token"]

    # Preview multiple times (non-consuming)
    for _ in range(3):
        preview_resp = await client.get(f"{API}/secrets/{token}")
        assert preview_resp.status_code == 200
        assert preview_resp.json()["consumed"] is False

    # Now reveal it
    reveal_resp = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert reveal_resp.status_code == 200
    assert reveal_resp.json()["secret"] == "preview-test-secret"

    # Verify it's now consumed
    final_preview = await client.get(f"{API}/secrets/{token}")
    assert final_preview.status_code == 200
    assert final_preview.json()["consumed"] is True
