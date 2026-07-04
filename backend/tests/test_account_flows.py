"""Email-driven account flow tests: password reset, verification, email change."""

from __future__ import annotations

import re

import pytest

from tests.conftest import API


@pytest.fixture
def mail_outbox(monkeypatch):
    """Capture outbound emails instead of sending them."""
    sent: list[dict] = []

    async def _capture(to: str, subject: str, body: str) -> None:
        sent.append({"to": to, "subject": subject, "body": body})

    monkeypatch.setattr("app.services.account_flows.send_email", _capture)
    return sent


def _token_from(mail: dict) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", mail["body"])
    assert match, f"no token link in email body: {mail['body']!r}"
    return match.group(1)


# --- Password reset ----------------------------------------------------------
async def test_forgot_password_is_uniform_for_unknown_accounts(client, mail_outbox):
    resp = await client.post(
        f"{API}/auth/forgot-password", json={"email": "ghost@example.com"}
    )
    assert resp.status_code == 202
    assert mail_outbox == []  # nothing sent, but the response is identical


async def test_password_reset_flow(client, register_and_login, mail_outbox):
    _, tokens = await register_and_login(email="forgetful@example.com")
    mail_outbox.clear()  # drop the registration verification email

    resp = await client.post(
        f"{API}/auth/forgot-password", json={"email": "forgetful@example.com"}
    )
    assert resp.status_code == 202
    assert len(mail_outbox) == 1
    assert mail_outbox[0]["to"] == "forgetful@example.com"
    token = _token_from(mail_outbox[0])

    resp = await client.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "brand-new-pass1"},
    )
    assert resp.status_code == 204

    # Old password dead, new one works, old refresh token revoked.
    old = await client.post(
        f"{API}/auth/login",
        json={"email": "forgetful@example.com", "password": "password123"},
    )
    assert old.status_code == 401
    new = await client.post(
        f"{API}/auth/login",
        json={"email": "forgetful@example.com", "password": "brand-new-pass1"},
    )
    assert new.status_code == 200
    refresh = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh.status_code == 401

    # Reset tokens are single-use.
    replay = await client.post(
        f"{API}/auth/reset-password",
        json={"token": token, "new_password": "yet-another-pass1"},
    )
    assert replay.status_code == 400
    assert replay.json()["error"]["code"] == "invalid_reset_token"


async def test_reset_password_rejects_garbage_token(client):
    resp = await client.post(
        f"{API}/auth/reset-password",
        json={"token": "not-a-real-token", "new_password": "whatever-pass1"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_reset_token"


# --- Email verification ----------------------------------------------------------
async def test_registration_sends_verification_and_verify_flow(
    client, register_and_login, mail_outbox
):
    headers, _ = await register_and_login(email="fresh@example.com")
    assert len(mail_outbox) == 1
    assert mail_outbox[0]["to"] == "fresh@example.com"
    assert "Verify" in mail_outbox[0]["subject"]

    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.json()["email_verified"] is False

    token = _token_from(mail_outbox[0])
    resp = await client.post(f"{API}/auth/verify-email", json={"token": token})
    assert resp.status_code == 204

    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.json()["email_verified"] is True

    replay = await client.post(f"{API}/auth/verify-email", json={"token": token})
    assert replay.status_code == 400
    assert replay.json()["error"]["code"] == "invalid_verification_token"


async def test_resend_verification(client, register_and_login, mail_outbox):
    headers, _ = await register_and_login(email="resend@example.com")
    mail_outbox.clear()

    resp = await client.post(f"{API}/auth/resend-verification", headers=headers)
    assert resp.status_code == 202
    assert len(mail_outbox) == 1
    token = _token_from(mail_outbox[0])

    await client.post(f"{API}/auth/verify-email", json={"token": token})
    mail_outbox.clear()

    # Already verified: still 202, but nothing is sent.
    resp = await client.post(f"{API}/auth/resend-verification", headers=headers)
    assert resp.status_code == 202
    assert mail_outbox == []


# --- Email change -----------------------------------------------------------------
async def test_email_change_requires_password_and_free_address(
    client, register_and_login, mail_outbox
):
    await register_and_login(email="taken@example.com")
    headers, _ = await register_and_login(email="changer@example.com")
    mail_outbox.clear()

    wrong = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "new@example.com", "password": "wrong"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "invalid_current_password"

    conflict = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "taken@example.com", "password": "password123"},
    )
    assert conflict.status_code == 409
    assert mail_outbox == []


async def test_email_change_flow(client, register_and_login, mail_outbox):
    headers, tokens = await register_and_login(email="old-addr@example.com")
    mail_outbox.clear()

    resp = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "New-Addr@example.com", "password": "password123"},
    )
    assert resp.status_code == 202
    assert len(mail_outbox) == 1
    assert mail_outbox[0]["to"] == "new-addr@example.com"  # sent to the NEW address
    token = _token_from(mail_outbox[0])

    confirm = await client.post(
        f"{API}/auth/confirm-email-change", json={"token": token}
    )
    assert confirm.status_code == 204

    # The still-valid access token shows the new, verified address.
    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.json()["email"] == "new-addr@example.com"
    assert me.json()["email_verified"] is True

    # Sessions were revoked; the old email no longer logs in, the new one does.
    refresh = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh.status_code == 401
    old_login = await client.post(
        f"{API}/auth/login",
        json={"email": "old-addr@example.com", "password": "password123"},
    )
    assert old_login.status_code == 401
    new_login = await client.post(
        f"{API}/auth/login",
        json={"email": "new-addr@example.com", "password": "password123"},
    )
    assert new_login.status_code == 200


async def test_email_change_confirm_conflicts_if_taken_meanwhile(
    client, register_and_login, mail_outbox
):
    headers, _ = await register_and_login(email="racer@example.com")
    mail_outbox.clear()

    await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "contested@example.com", "password": "password123"},
    )
    token = _token_from(mail_outbox[0])

    # Someone registers the target address before the change is confirmed.
    await register_and_login(email="contested@example.com")

    confirm = await client.post(
        f"{API}/auth/confirm-email-change", json={"token": token}
    )
    assert confirm.status_code == 409
    assert confirm.json()["error"]["code"] == "email_exists"

    # The requester keeps their original address.
    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.json()["email"] == "racer@example.com"
