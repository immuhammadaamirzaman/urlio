from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.core.exceptions import SecretShareAuthRequiredError, SecretShareExpiredError
from app.services.secrets import create_secret_share, open_secret_share

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

# --- Sender-chosen access control -------------------------------------------
#
# Every share carries the sender's answer to "may anyone holding this link open it?".
# Two properties matter beyond the flag being honored:
#
#   * The preview must report it to anonymous callers, or the UI cannot tell "you need to
#     sign in" apart from "this link is broken".
#   * Turning a reader away must not spend the single reveal, or the sign-in prompt would
#     hand back a dead link.


@pytest.mark.asyncio
async def test_share_defaults_to_open_access(client, register_and_login):
    """Omitting the flag keeps the original behavior: any holder of the link may open it."""
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "open-to-anyone", "expires_in_seconds": 60},
        headers=headers,
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["require_auth"] is False
    token = create_resp.json()["token"]

    preview_resp = await client.get(f"{API}/secrets/{token}")
    assert preview_resp.status_code == 200
    assert preview_resp.json()["require_auth"] is False

    # Deliberately unauthenticated: no Authorization header on the reveal.
    open_resp = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert open_resp.status_code == 200
    assert open_resp.json()["secret"] == "open-to-anyone"


@pytest.mark.asyncio
async def test_require_auth_refuses_anonymous_reveal(client, register_and_login):
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "members-only", "expires_in_seconds": 60, "require_auth": True},
        headers=headers,
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["require_auth"] is True
    token = create_resp.json()["token"]

    open_resp = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert open_resp.status_code == 401
    assert open_resp.json()["error"]["code"] == "secret_auth_required"
    assert "secret" not in open_resp.json()


@pytest.mark.asyncio
async def test_refused_reveal_does_not_spend_the_share(client, register_and_login):
    """A turned-away reader costs nothing, and can return to the same link after signing in.

    This is why the gate sits ahead of the Redis claim in ``open_secret_share``.
    """
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "still-here", "expires_in_seconds": 60, "require_auth": True},
        headers=headers,
    )
    token = create_resp.json()["token"]

    for _ in range(3):
        refused = await client.get(f"{API}/secrets/{token}?reveal=true")
        assert refused.status_code == 401

    preview_resp = await client.get(f"{API}/secrets/{token}")
    assert preview_resp.status_code == 200
    assert preview_resp.json()["consumed"] is False

    opened = await client.get(f"{API}/secrets/{token}?reveal=true", headers=headers)
    assert opened.status_code == 200
    assert opened.json()["secret"] == "still-here"


@pytest.mark.asyncio
async def test_require_auth_is_visible_to_an_anonymous_preview(client, register_and_login):
    """The preview stays open on a gated share — metadata only, never the secret."""
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "gated", "expires_in_seconds": 60, "require_auth": True},
        headers=headers,
    )
    token = create_resp.json()["token"]

    preview_resp = await client.get(f"{API}/secrets/{token}")
    assert preview_resp.status_code == 200
    body = preview_resp.json()
    assert body["require_auth"] is True
    assert body["consumed"] is False
    assert "secret" not in body


@pytest.mark.asyncio
async def test_require_auth_accepts_any_signed_in_reader(client, register_and_login):
    """The flag means "signed in", not "the sender only": the recipient uses their own account."""
    sender_headers, _ = await register_and_login("sender@example.com")

    create_resp = await client.post(
        f"{API}/secrets",
        json={
            "secret": "for-a-colleague",
            "expires_in_seconds": 60,
            "require_auth": True,
        },
        headers=sender_headers,
    )
    token = create_resp.json()["token"]

    recipient_headers, _ = await register_and_login("recipient@example.com")
    opened = await client.get(
        f"{API}/secrets/{token}?reveal=true", headers=recipient_headers
    )
    assert opened.status_code == 200
    assert opened.json()["secret"] == "for-a-colleague"


@pytest.mark.asyncio
async def test_require_auth_rejects_an_invalid_bearer_token(client, register_and_login):
    """A junk or expired token is anonymous, not authenticated, and must not open the share."""
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "no-sneaking-in", "expires_in_seconds": 60, "require_auth": True},
        headers=headers,
    )
    token = create_resp.json()["token"]

    refused = await client.get(
        f"{API}/secrets/{token}?reveal=true",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert refused.status_code == 401
    assert refused.json()["error"]["code"] == "secret_auth_required"

    survived = await client.get(f"{API}/secrets/{token}")
    assert survived.json()["consumed"] is False


@pytest.mark.asyncio
async def test_anonymous_sender_can_require_auth(client):
    """Creating a share needs no account, so neither does choosing to gate one."""
    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "anon-gated", "expires_in_seconds": 60, "require_auth": True},
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["require_auth"] is True
    token = create_resp.json()["token"]

    refused = await client.get(f"{API}/secrets/{token}?reveal=true")
    assert refused.status_code == 401
    assert refused.json()["error"]["code"] == "secret_auth_required"


@pytest.mark.asyncio
async def test_a_gated_share_can_still_only_be_opened_once(client, register_and_login):
    """Gating changes who may open a share, not how many times it opens."""
    headers, _ = await register_and_login()

    create_resp = await client.post(
        f"{API}/secrets",
        json={"secret": "once-only", "expires_in_seconds": 60, "require_auth": True},
        headers=headers,
    )
    token = create_resp.json()["token"]

    first = await client.get(f"{API}/secrets/{token}?reveal=true", headers=headers)
    assert first.status_code == 200

    second = await client.get(f"{API}/secrets/{token}?reveal=true", headers=headers)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "secret_already_consumed"


@pytest.mark.asyncio
async def test_expiry_outranks_the_sign_in_gate(db_session, fake_redis):
    """An expired gated link reports expiry, rather than sending someone to sign in for nothing.

    Driven through the service so the share can be aged without waiting for the clock.
    """
    share = await create_secret_share(
        db_session, "too-late", expires_in_seconds=60, require_auth=True
    )
    share.expires_at = datetime.now(UTC) - timedelta(minutes=5)
    await db_session.commit()

    with pytest.raises(SecretShareExpiredError):
        await open_secret_share(db_session, fake_redis, share.token)


@pytest.mark.asyncio
async def test_service_gate_rejects_an_anonymous_viewer(db_session, fake_redis):
    """The rule lives in the service, so it holds for any caller, not just the HTTP route."""
    share = await create_secret_share(
        db_session, "service-level", expires_in_seconds=60, require_auth=True
    )

    with pytest.raises(SecretShareAuthRequiredError):
        await open_secret_share(db_session, fake_redis, share.token, viewer=None)

    # Nothing was claimed: the ciphertext is still there to be decrypted later.
    await db_session.refresh(share)
    assert share.consumed_at is None
    assert share.ciphertext is not None
