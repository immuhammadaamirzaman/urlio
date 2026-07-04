"""Active-session tests: listing, metadata capture, rotation lineage, per-session revoke."""

from __future__ import annotations

from app.cache.redis import refresh_jti_key, refresh_user_set_key
from tests.conftest import API


async def _login(client, email: str, password: str = "password123", ua: str = "TestUA"):
    resp = await client.post(
        f"{API}/auth/login",
        json={"email": email, "password": password},
        headers={"user-agent": ua},
    )
    assert resp.status_code == 200
    return resp.json()


async def test_sessions_list_one_per_device(client, register_and_login):
    headers, _ = await register_and_login(email="dev@example.com")
    await _login(client, "dev@example.com", ua="DeviceB/2.0")

    resp = await client.get(f"{API}/users/me/sessions", headers=headers)
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 2
    agents = {s["user_agent"] for s in sessions}
    assert "DeviceB/2.0" in agents
    for s in sessions:
        assert s["jti"]
        assert s["created_at"] is not None
        assert s["refreshed_at"] is not None


async def test_rotation_keeps_one_session_and_its_created_at(client, register_and_login):
    headers, tokens = await register_and_login(email="rot8@example.com")

    before = (await client.get(f"{API}/users/me/sessions", headers=headers)).json()
    assert len(before) == 1
    original_jti = before[0]["jti"]
    original_created = before[0]["created_at"]

    rotated = await client.post(
        f"{API}/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
        headers={"user-agent": "RotatedUA/1.0"},
    )
    assert rotated.status_code == 200

    after = (await client.get(f"{API}/users/me/sessions", headers=headers)).json()
    assert len(after) == 1
    assert after[0]["jti"] != original_jti
    assert after[0]["created_at"] == original_created
    assert after[0]["user_agent"] == "RotatedUA/1.0"


async def test_revoke_single_session(client, register_and_login):
    headers, first_tokens = await register_and_login(email="single@example.com")
    second_tokens = await _login(client, "single@example.com", ua="SecondDevice/1.0")

    sessions = (await client.get(f"{API}/users/me/sessions", headers=headers)).json()
    assert len(sessions) == 2
    target = next(s for s in sessions if s["user_agent"] == "SecondDevice/1.0")

    resp = await client.delete(
        f"{API}/users/me/sessions/{target['jti']}", headers=headers
    )
    assert resp.status_code == 204

    # The revoked session's refresh token is dead; the other still rotates.
    dead = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": second_tokens["refresh_token"]}
    )
    assert dead.status_code == 401
    alive = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": first_tokens["refresh_token"]}
    )
    assert alive.status_code == 200

    remaining = (await client.get(f"{API}/users/me/sessions", headers=headers)).json()
    assert len(remaining) == 1

    # Revoking again (or a bogus jti) is an idempotent no-op.
    again = await client.delete(
        f"{API}/users/me/sessions/{target['jti']}", headers=headers
    )
    assert again.status_code == 204


async def test_logout_all_empties_sessions(client, register_and_login):
    headers, _ = await register_and_login(email="empty@example.com")
    await _login(client, "empty@example.com", ua="Another/1.0")

    resp = await client.post(f"{API}/auth/logout-all", headers=headers)
    assert resp.status_code == 204

    sessions = (await client.get(f"{API}/users/me/sessions", headers=headers)).json()
    assert sessions == []


async def test_legacy_and_stale_jtis_are_tolerated(
    client, register_and_login, fake_redis
):
    headers, _ = await register_and_login(email="legacy@example.com")
    me = await client.get(f"{API}/users/me", headers=headers)
    user_id = me.json()["id"]

    # A pre-v0.2 session stored the bare marker "1"; a stale set entry has no key at all.
    await fake_redis.sadd(refresh_user_set_key(user_id), "legacyjti", "stalejti")
    await fake_redis.set(refresh_jti_key(user_id, "legacyjti"), "1")

    resp = await client.get(f"{API}/users/me/sessions", headers=headers)
    assert resp.status_code == 200
    sessions = resp.json()
    jtis = {s["jti"] for s in sessions}
    assert "legacyjti" in jtis  # listed, with unknown metadata
    assert "stalejti" not in jtis  # pruned lazily
    legacy = next(s for s in sessions if s["jti"] == "legacyjti")
    assert legacy["created_at"] is None
    assert legacy["user_agent"] is None

    # The stale entry was removed from the set.
    members = await fake_redis.smembers(refresh_user_set_key(user_id))
    assert "stalejti" not in members
