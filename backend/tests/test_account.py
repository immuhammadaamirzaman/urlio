"""Account lifecycle: email verification, password reset, email change, sessions, deletion."""

from __future__ import annotations

from app.core.security import create_verify_email_token
from tests.conftest import API


# --- Email verification ----------------------------------------------------
async def test_register_creates_unverified_user_and_sends_email(client, captured_emails):
    resp = await client.post(
        f"{API}/auth/register",
        json={"email": "newbie@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    assert resp.json()["email_verified"] is False
    # The verification email fired (as a background task) on registration.
    assert any(e["kind"] == "verify" and e["to"] == "newbie@example.com" for e in captured_emails)


async def test_verify_email_marks_verified(client, register_and_login):
    headers, _ = await register_and_login(email="verify-me@example.com")
    me = await client.get(f"{API}/users/me", headers=headers)
    user_id = me.json()["id"]
    assert me.json()["email_verified"] is False

    token = create_verify_email_token(user_id)
    resp = await client.post(f"{API}/auth/verify-email", json={"token": token})
    assert resp.status_code == 204

    me2 = await client.get(f"{API}/users/me", headers=headers)
    assert me2.json()["email_verified"] is True


async def test_verify_email_rejects_garbage_token(client):
    resp = await client.post(f"{API}/auth/verify-email", json={"token": "not-a-jwt"})
    assert resp.status_code == 401


async def test_resend_verification(client, register_and_login, captured_emails):
    headers, _ = await register_and_login(email="resend@example.com")
    resp = await client.post(f"{API}/auth/resend-verification", headers=headers)
    assert resp.status_code == 204
    assert any(e["kind"] == "verify" and e["to"] == "resend@example.com" for e in captured_emails)


async def test_resend_verification_conflicts_when_already_verified(
    client, register_and_login
):
    headers, _ = await register_and_login(email="already@example.com")
    user_id = (await client.get(f"{API}/users/me", headers=headers)).json()["id"]
    await client.post(
        f"{API}/auth/verify-email", json={"token": create_verify_email_token(user_id)}
    )

    resp = await client.post(f"{API}/auth/resend-verification", headers=headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "email_already_verified"


async def test_resend_verification_requires_auth(client):
    # HTTPBearer returns 403 when the Authorization header is absent entirely.
    resp = await client.post(f"{API}/auth/resend-verification")
    assert resp.status_code == 403


# --- Password reset --------------------------------------------------------
async def test_forgot_password_does_not_leak_unknown_email(client, captured_emails):
    resp = await client.post(
        f"{API}/auth/forgot-password", json={"email": "ghost@example.com"}
    )
    assert resp.status_code == 204
    assert captured_emails == []  # no email for a non-existent account


async def test_password_reset_flow_is_single_use(client, register_and_login, captured_emails):
    email = "resetme@example.com"
    await register_and_login(email=email, password="oldpassword1")

    forgot = await client.post(f"{API}/auth/forgot-password", json={"email": email})
    assert forgot.status_code == 204
    token = next(e["token"] for e in captured_emails if e["kind"] == "reset")

    reset = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "newpassword1"}
    )
    assert reset.status_code == 204

    # Old password no longer works; the new one does.
    old = await client.post(
        f"{API}/auth/login", json={"email": email, "password": "oldpassword1"}
    )
    assert old.status_code == 401
    new = await client.post(
        f"{API}/auth/login", json={"email": email, "password": "newpassword1"}
    )
    assert new.status_code == 200

    # The reset token cannot be replayed.
    replay = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "another1"}
    )
    assert replay.status_code == 401


async def test_reset_password_rejects_invalid_token(client):
    resp = await client.post(
        f"{API}/auth/reset-password", json={"token": "bogus", "new_password": "whatever12"}
    )
    assert resp.status_code == 401


async def test_reset_password_rejected_for_deactivated_account(
    client, register_and_login, captured_emails, db_session
):
    from sqlalchemy import update as sa_update

    from app.models.user import User

    email = "frozen@example.com"
    await register_and_login(email=email, password="password123")
    await client.post(f"{API}/auth/forgot-password", json={"email": email})
    token = next(e["token"] for e in captured_emails if e["kind"] == "reset")

    # Account is deactivated after the link was issued.
    await db_session.execute(
        sa_update(User).where(User.email == email).values(is_active=False)
    )
    await db_session.commit()

    resp = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "newpassword1"}
    )
    assert resp.status_code == 401


# --- Email change ----------------------------------------------------------
async def test_email_change_flow(client, register_and_login, captured_emails):
    headers, _ = await register_and_login(email="old-addr@example.com", password="password123")

    # Wrong password → 403 invalid_password, NOT a 401 (which would nuke the caller's own
    # session).
    bad = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "new-addr@example.com", "password": "wrongpass"},
    )
    assert bad.status_code == 403
    assert bad.json()["error"]["code"] == "invalid_password"

    ok = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "new-addr@example.com", "password": "password123"},
    )
    assert ok.status_code == 204
    token = next(e["token"] for e in captured_emails if e["kind"] == "email_change")
    assert captured_emails[-1]["to"] == "new-addr@example.com"

    confirm = await client.post(f"{API}/auth/confirm-email-change", json={"token": token})
    assert confirm.status_code == 204

    # Login now works with the new address and the account is verified.
    new_login = await client.post(
        f"{API}/auth/login", json={"email": "new-addr@example.com", "password": "password123"}
    )
    assert new_login.status_code == 200
    old_login = await client.post(
        f"{API}/auth/login", json={"email": "old-addr@example.com", "password": "password123"}
    )
    assert old_login.status_code == 401

    # The confirmation token is single-use: replaying it is rejected.
    replay = await client.post(f"{API}/auth/confirm-email-change", json={"token": token})
    assert replay.status_code == 401


async def test_email_change_to_taken_address_is_silent_no_leak(
    client, register_and_login, captured_emails
):
    # A taken address must NOT be distinguishable from a free one (no enumeration oracle):
    # both return 204; the taken one simply never sends a confirmation email.
    await register_and_login(email="taken@example.com")
    headers, _ = await register_and_login(email="mover@example.com", password="password123")
    captured_emails.clear()

    resp = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "taken@example.com", "password": "password123"},
    )
    assert resp.status_code == 204
    assert not any(e["kind"] == "email_change" for e in captured_emails)


async def test_email_change_wrong_password_still_rejected(client, register_and_login):
    headers, _ = await register_and_login(email="mover2@example.com", password="password123")
    resp = await client.post(
        f"{API}/users/me/email",
        headers=headers,
        json={"new_email": "brand-new@example.com", "password": "wrongpass"},
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "invalid_password"


# --- Sessions & password change --------------------------------------------
async def test_sessions_listed_and_revocable(client, register_and_login):
    headers, tokens = await register_and_login(email="sessions@example.com")
    # A second login creates a second session.
    await client.post(
        f"{API}/auth/login", json={"email": "sessions@example.com", "password": "password123"}
    )

    listed = await client.get(f"{API}/users/me/sessions", headers=headers)
    assert listed.status_code == 200
    sessions = listed.json()
    assert len(sessions) == 2
    assert all("jti" in s for s in sessions)

    # Revoke the *newest* session so the caller's own (older) token keeps working.
    jti = max(sessions, key=lambda s: s["created_at"])["jti"]
    revoke = await client.delete(f"{API}/users/me/sessions/{jti}", headers=headers)
    assert revoke.status_code == 204

    after = await client.get(f"{API}/users/me/sessions", headers=headers)
    assert len(after.json()) == 1


async def test_revoking_a_session_immediately_invalidates_its_access_token(
    client, register_and_login
):
    # Session A is the one we'll revoke; session B does the revoking.
    headers_a, tokens_a = await register_and_login(email="multi@example.com")
    login_b = await client.post(
        f"{API}/auth/login", json={"email": "multi@example.com", "password": "password123"}
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # A's access token works before revocation.
    assert (await client.get(f"{API}/users/me", headers=headers_a)).status_code == 200

    # From B, find and revoke A's session (the older one).
    sessions = (await client.get(f"{API}/users/me/sessions", headers=headers_b)).json()
    a_jti = min(sessions, key=lambda s: s["created_at"])["jti"]
    revoke = await client.delete(f"{API}/users/me/sessions/{a_jti}", headers=headers_b)
    assert revoke.status_code == 204

    # A's access token is now rejected immediately (not just after it expires).
    dead = await client.get(f"{API}/users/me", headers=headers_a)
    assert dead.status_code == 401
    assert dead.json()["error"]["code"] == "token_revoked"
    # B is unaffected.
    assert (await client.get(f"{API}/users/me", headers=headers_b)).status_code == 200


async def test_logout_immediately_invalidates_access_token(client, register_and_login):
    headers, tokens = await register_and_login(email="logout-now@example.com")
    assert (await client.get(f"{API}/users/me", headers=headers)).status_code == 200

    resp = await client.post(
        f"{API}/auth/logout", headers=headers, json={"refresh_token": tokens["refresh_token"]}
    )
    assert resp.status_code == 204
    # The access token from the logged-out session no longer works.
    after = await client.get(f"{API}/users/me", headers=headers)
    assert after.status_code == 401


async def test_password_change_requires_current_and_revokes_sessions(
    client, register_and_login
):
    headers, tokens = await register_and_login(email="pwchange@example.com", password="password123")

    # Wrong current password is rejected with 403 invalid_password (not a session-killing
    # 401).
    bad = await client.patch(
        f"{API}/users/me",
        headers=headers,
        json={"password": "brandnew123", "current_password": "wrong"},
    )
    assert bad.status_code == 403
    assert bad.json()["error"]["code"] == "invalid_password"

    ok = await client.patch(
        f"{API}/users/me",
        headers=headers,
        json={"password": "brandnew123", "current_password": "password123"},
    )
    assert ok.status_code == 200

    # All refresh sessions were revoked — the old refresh token no longer works.
    refresh = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh.status_code == 401


# --- UI preferences (theme / accent) ---------------------------------------
async def test_theme_and_accent_default_and_persist(client, register_and_login):
    headers, _ = await register_and_login(email="themer@example.com")

    # New accounts default to system / blue.
    me = (await client.get(f"{API}/users/me", headers=headers)).json()
    assert me["theme"] == "system"
    assert me["accent"] == "blue"

    # Updating both round-trips and persists.
    resp = await client.patch(
        f"{API}/users/me", headers=headers, json={"theme": "dark", "accent": "#1f47f5"}
    )
    assert resp.status_code == 200
    assert resp.json()["theme"] == "dark"
    assert resp.json()["accent"] == "#1f47f5"

    me2 = (await client.get(f"{API}/users/me", headers=headers)).json()
    assert me2["theme"] == "dark"
    assert me2["accent"] == "#1f47f5"


async def test_invalid_theme_and_accent_rejected(client, register_and_login):
    headers, _ = await register_and_login(email="badtheme@example.com")

    bad_theme = await client.patch(f"{API}/users/me", headers=headers, json={"theme": "neon"})
    assert bad_theme.status_code == 422
    assert bad_theme.json()["error"]["code"] == "validation_error"

    # Accent must be a "#rrggbb" hex or a short lowercase preset key.
    bad_accent = await client.patch(
        f"{API}/users/me", headers=headers, json={"accent": "rgb(1,2,3)"}
    )
    assert bad_accent.status_code == 422


# --- Account deletion (self-service = soft delete / disable) ----------------
async def test_delete_account(client, register_and_login):
    headers, _ = await register_and_login(email="deleteme@example.com", password="password123")

    # Wrong password → 403 invalid_password, and the session MUST survive (the access
    # token still works afterwards — a wrong confirm password is not a dead session).
    bad = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "wrong"}
    )
    assert bad.status_code == 403
    assert bad.json()["error"]["code"] == "invalid_password"
    assert (await client.get(f"{API}/users/me", headers=headers)).status_code == 200

    ok = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "password123"}
    )
    assert ok.status_code == 204

    # The session is revoked, so the old access token stops working immediately.
    assert (await client.get(f"{API}/users/me", headers=headers)).status_code == 401

    # Soft delete: the account is disabled (not erased), so login is refused as *inactive*
    # rather than looking like an unknown account.
    login = await client.post(
        f"{API}/auth/login", json={"email": "deleteme@example.com", "password": "password123"}
    )
    assert login.status_code == 403
    assert login.json()["error"]["code"] == "inactive_user"


async def test_delete_account_retains_data_and_deactivates_links(
    client, register_and_login, db_session
):
    from sqlalchemy import select

    from app.models.link import Link
    from app.models.user import User

    headers, _ = await register_and_login(email="softdel@example.com", password="password123")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://ex.com/keep"}
    )
    code = created.json()["code"]
    # The link resolves (307) before the account is deleted.
    assert (await client.get(f"/{code}", follow_redirects=False)).status_code == 307

    ok = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "password123"}
    )
    assert ok.status_code == 204

    # The user row is retained but disabled and stamped with a deletion time.
    user = (
        await db_session.execute(select(User).where(User.email == "softdel@example.com"))
    ).scalar_one()
    assert user.is_active is False
    assert user.deleted_at is not None

    # The link row is retained but deactivated → the short URL no longer resolves (404).
    link = (
        await db_session.execute(select(Link).where(Link.code == code))
    ).scalar_one()
    assert link.is_active is False
    assert (await client.get(f"/{code}", follow_redirects=False)).status_code == 404


async def test_soft_deleted_email_stays_reserved(client, register_and_login):
    # Because a self-delete retains the account (and its unique email) rather than erasing
    # it, the address cannot be re-registered — only an admin can restore or hard-delete it.
    headers, _ = await register_and_login(email="reserved@example.com", password="password123")
    ok = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "password123"}
    )
    assert ok.status_code == 204

    again = await client.post(
        f"{API}/auth/register",
        json={"email": "reserved@example.com", "password": "password123"},
    )
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "email_exists"
