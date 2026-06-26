"""Auth flow tests: register, login, refresh rotation, logout, logout-all."""

from __future__ import annotations

from tests.conftest import API


async def test_register_returns_user(client):
    resp = await client.post(
        f"{API}/auth/register",
        json={"email": "a@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "a@example.com"
    assert "id" in body
    assert "hashed_password" not in body


async def test_register_duplicate_email_conflicts(client):
    payload = {"email": "dup@example.com", "password": "password123"}
    await client.post(f"{API}/auth/register", json=payload)
    resp = await client.post(f"{API}/auth/register", json=payload)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "email_exists"


async def test_login_returns_token_pair(client):
    await client.post(
        f"{API}/auth/register",
        json={"email": "b@example.com", "password": "password123"},
    )
    resp = await client.post(
        f"{API}/auth/login", json={"email": "b@example.com", "password": "password123"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0


async def test_login_wrong_password_and_unknown_email_are_identical(client):
    await client.post(
        f"{API}/auth/register",
        json={"email": "c@example.com", "password": "password123"},
    )
    wrong = await client.post(
        f"{API}/auth/login", json={"email": "c@example.com", "password": "nope"}
    )
    unknown = await client.post(
        f"{API}/auth/login", json={"email": "ghost@example.com", "password": "whatever"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "invalid_credentials"
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_refresh_rotation_invalidates_old_token(client, register_and_login):
    _, tokens = await register_and_login(email="rot@example.com")
    old_refresh = tokens["refresh_token"]

    rotated = await client.post(f"{API}/auth/refresh", json={"refresh_token": old_refresh})
    assert rotated.status_code == 200
    new_tokens = rotated.json()
    assert new_tokens["refresh_token"] != old_refresh

    # Reusing the old refresh token must now fail (single-use rotation).
    replay = await client.post(f"{API}/auth/refresh", json={"refresh_token": old_refresh})
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "token_revoked"


async def test_logout_revokes_refresh(client, register_and_login):
    headers, tokens = await register_and_login(email="lo@example.com")
    resp = await client.post(
        f"{API}/auth/logout",
        headers=headers,
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert resp.status_code == 204
    after = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert after.status_code == 401


async def test_logout_all_revokes_every_refresh(client, register_and_login):
    headers, first = await register_and_login(email="all@example.com")
    # A second login mints a second refresh token for the same user.
    second_login = await client.post(
        f"{API}/auth/login", json={"email": "all@example.com", "password": "password123"}
    )
    second = second_login.json()

    resp = await client.post(f"{API}/auth/logout-all", headers=headers)
    assert resp.status_code == 204

    for refresh in (first["refresh_token"], second["refresh_token"]):
        r = await client.post(f"{API}/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 401
