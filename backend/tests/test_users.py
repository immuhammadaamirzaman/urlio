"""Profile endpoint tests: /users/me reads and updates, password-change hardening."""

from __future__ import annotations

from tests.conftest import API


async def test_get_me_returns_profile(client, register_and_login):
    headers, _ = await register_and_login(email="me@example.com", display_name="Me")
    resp = await client.get(f"{API}/users/me", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "me@example.com"
    assert body["display_name"] == "Me"
    assert "hashed_password" not in body


async def test_update_display_name_needs_no_current_password(client, register_and_login):
    headers, _ = await register_and_login(email="name@example.com")
    resp = await client.patch(
        f"{API}/users/me", headers=headers, json={"display_name": "New Name"}
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "New Name"

    # Explicit null clears the display name.
    cleared = await client.patch(
        f"{API}/users/me", headers=headers, json={"display_name": None}
    )
    assert cleared.status_code == 200
    assert cleared.json()["display_name"] is None


async def test_password_change_without_current_password_is_rejected(
    client, register_and_login
):
    headers, _ = await register_and_login(email="nocur@example.com")
    resp = await client.patch(
        f"{API}/users/me", headers=headers, json={"password": "newpassword123"}
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_password_change_with_wrong_current_password_is_rejected(
    client, register_and_login
):
    headers, _ = await register_and_login(email="wrongcur@example.com")
    resp = await client.patch(
        f"{API}/users/me",
        headers=headers,
        json={"password": "newpassword123", "current_password": "not-the-password"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_current_password"

    # The old password must still work.
    login = await client.post(
        f"{API}/auth/login",
        json={"email": "wrongcur@example.com", "password": "password123"},
    )
    assert login.status_code == 200


async def test_password_change_rotates_credentials_and_revokes_sessions(
    client, register_and_login
):
    headers, tokens = await register_and_login(email="rotate@example.com")
    # A second login simulates another device holding its own refresh token.
    second_login = await client.post(
        f"{API}/auth/login",
        json={"email": "rotate@example.com", "password": "password123"},
    )
    second = second_login.json()

    resp = await client.patch(
        f"{API}/users/me",
        headers=headers,
        json={"password": "newpassword456", "current_password": "password123"},
    )
    assert resp.status_code == 200

    # Old password no longer authenticates; the new one does.
    old = await client.post(
        f"{API}/auth/login",
        json={"email": "rotate@example.com", "password": "password123"},
    )
    assert old.status_code == 401
    new = await client.post(
        f"{API}/auth/login",
        json={"email": "rotate@example.com", "password": "newpassword456"},
    )
    assert new.status_code == 200

    # Every pre-change refresh token is revoked.
    for refresh in (tokens["refresh_token"], second["refresh_token"]):
        r = await client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "token_revoked"

    # The access token that performed the change stays valid until it expires.
    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.status_code == 200


async def test_delete_account_requires_correct_password(client, register_and_login):
    headers, _ = await register_and_login(email="keepme@example.com")
    resp = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "wrong-password"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_current_password"

    still_there = await client.get(f"{API}/users/me", headers=headers)
    assert still_there.status_code == 200


async def test_delete_account_removes_user_links_and_sessions(
    client, register_and_login
):
    headers, tokens = await register_and_login(email="goodbye@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/bye"}
    )
    code = created.json()["code"]

    # Prime the redirect cache so deletion must invalidate it, not just the DB row.
    assert (await client.get(f"/{code}")).status_code == 307

    resp = await client.request(
        "DELETE", f"{API}/users/me", headers=headers, json={"password": "password123"}
    )
    assert resp.status_code == 204

    # Credentials, tokens, and owned short links are all gone.
    login = await client.post(
        f"{API}/auth/login",
        json={"email": "goodbye@example.com", "password": "password123"},
    )
    assert login.status_code == 401
    refresh = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh.status_code == 401
    me = await client.get(f"{API}/users/me", headers=headers)
    assert me.status_code == 401
    assert (await client.get(f"/{code}")).status_code == 404
