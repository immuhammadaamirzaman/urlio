"""Admin layer tests: access control, moderation actions, stats, and the audit log."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.user import User
from tests.conftest import API


@pytest.fixture
def make_admin(db_session):
    """Return an async helper that flips ``is_superuser`` for a registered email."""

    async def _helper(email: str) -> None:
        result = await db_session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.is_superuser = True
        await db_session.commit()

    return _helper


@pytest.fixture
def admin_headers(register_and_login, make_admin):
    """Register + promote an admin, returning auth headers."""

    async def _helper(email: str = "admin@example.com") -> dict[str, str]:
        headers, _ = await register_and_login(email=email)
        await make_admin(email)
        return headers

    return _helper


async def test_admin_endpoints_reject_non_admins(client, register_and_login):
    headers, _ = await register_and_login(email="pleb@example.com")
    for path in ("/admin/users", "/admin/links", "/admin/stats", "/admin/audit"):
        resp = await client.get(f"{API}{path}", headers=headers)
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "admin_required"


async def test_admin_lists_and_searches_users(client, register_and_login, admin_headers):
    await register_and_login(email="alice@example.com")
    bob_headers, _ = await register_and_login(email="bob@example.com")
    await client.post(
        f"{API}/links", headers=bob_headers, json={"target_url": "https://example.com/b"}
    )
    headers = await admin_headers()

    resp = await client.get(f"{API}/admin/users", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3

    search = await client.get(f"{API}/admin/users?q=bob", headers=headers)
    assert search.status_code == 200
    items = search.json()["items"]
    assert len(items) == 1
    assert items[0]["email"] == "bob@example.com"
    assert items[0]["link_count"] == 1


async def test_admin_deactivation_blocks_login_and_revokes_sessions(
    client, register_and_login, admin_headers
):
    user_headers, user_tokens = await register_and_login(email="victim@example.com")
    me = await client.get(f"{API}/users/me", headers=user_headers)
    user_id = me.json()["id"]
    headers = await admin_headers()

    resp = await client.patch(
        f"{API}/admin/users/{user_id}", headers=headers, json={"is_active": False}
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Existing access token, refresh token, and fresh logins all stop working.
    denied = await client.get(f"{API}/users/me", headers=user_headers)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "inactive_user"
    refresh = await client.post(
        f"{API}/auth/refresh", json={"refresh_token": user_tokens["refresh_token"]}
    )
    assert refresh.status_code == 401
    login = await client.post(
        f"{API}/auth/login",
        json={"email": "victim@example.com", "password": "password123"},
    )
    assert login.status_code == 403

    # Reactivation restores login.
    resp = await client.patch(
        f"{API}/admin/users/{user_id}", headers=headers, json={"is_active": True}
    )
    assert resp.status_code == 200
    login = await client.post(
        f"{API}/auth/login",
        json={"email": "victim@example.com", "password": "password123"},
    )
    assert login.status_code == 200


async def test_admin_deactivation_can_disable_links(
    client, register_and_login, admin_headers
):
    user_headers, _ = await register_and_login(email="spammer@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://example.com/spam"}
    )
    code = created.json()["code"]
    me = await client.get(f"{API}/users/me", headers=user_headers)
    user_id = me.json()["id"]

    # Prime the redirect cache, then take the user down with their links.
    hit = await client.get(f"/{code}")
    assert hit.status_code == 307
    headers = await admin_headers()
    resp = await client.patch(
        f"{API}/admin/users/{user_id}",
        headers=headers,
        json={"is_active": False, "disable_links": True},
    )
    assert resp.status_code == 200

    gone = await client.get(f"/{code}")
    assert gone.status_code == 404


async def test_admin_cannot_modify_superusers(client, admin_headers, register_and_login):
    headers = await admin_headers()
    other_headers = await admin_headers(email="admin2@example.com")
    me = await client.get(f"{API}/users/me", headers=other_headers)
    other_id = me.json()["id"]

    resp = await client.patch(
        f"{API}/admin/users/{other_id}", headers=headers, json={"is_active": False}
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "cannot_modify_superuser"


async def test_admin_link_takedown_invalidates_cache(
    client, register_and_login, admin_headers
):
    user_headers, _ = await register_and_login(email="owner@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://example.com/t"}
    )
    link_id = created.json()["id"]
    code = created.json()["code"]

    hit = await client.get(f"/{code}")
    assert hit.status_code == 307  # now cached in Redis

    headers = await admin_headers()
    resp = await client.patch(
        f"{API}/admin/links/{link_id}", headers=headers, json={"is_active": False}
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False
    assert resp.json()["owner_email"] == "owner@example.com"

    gone = await client.get(f"/{code}")
    assert gone.status_code == 404

    # Re-enable and the redirect works again.
    resp = await client.patch(
        f"{API}/admin/links/{link_id}", headers=headers, json={"is_active": True}
    )
    assert resp.status_code == 200
    back = await client.get(f"/{code}")
    assert back.status_code == 307


async def test_admin_deletes_link(client, register_and_login, admin_headers):
    user_headers, _ = await register_and_login(email="deleteme@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://example.com/d"}
    )
    link_id = created.json()["id"]
    code = created.json()["code"]
    headers = await admin_headers()

    resp = await client.delete(f"{API}/admin/links/{link_id}", headers=headers)
    assert resp.status_code == 204

    assert (await client.get(f"/{code}")).status_code == 404
    owner_view = await client.get(f"{API}/links/{link_id}", headers=user_headers)
    assert owner_view.status_code == 404


async def test_admin_link_search_filters(client, register_and_login, admin_headers):
    user_headers, _ = await register_and_login(email="filter@example.com")
    await client.post(
        f"{API}/links",
        headers=user_headers,
        json={"target_url": "https://example.com/apples", "custom_alias": "apples"},
    )
    await client.post(
        f"{API}/links",
        headers=user_headers,
        json={"target_url": "https://example.com/pears", "custom_alias": "pears"},
    )
    headers = await admin_headers()

    search = await client.get(f"{API}/admin/links?q=apples", headers=headers)
    assert search.status_code == 200
    items = search.json()["items"]
    assert len(items) == 1
    assert items[0]["code"] == "apples"
    assert items[0]["owner_email"] == "filter@example.com"


async def test_admin_stats_counts_platform_totals(
    client, register_and_login, admin_headers
):
    user_headers, _ = await register_and_login(email="counted@example.com")
    await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://example.com/s"}
    )
    headers = await admin_headers()

    resp = await client.get(f"{API}/admin/stats", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_users"] == 2
    assert body["active_users"] == 2
    assert body["total_links"] == 1
    assert body["active_links"] == 1
    assert body["new_users_last_7d"] == 2
    assert isinstance(body["clicks_per_day"], list)


async def test_admin_actions_are_audited(client, register_and_login, admin_headers):
    user_headers, _ = await register_and_login(email="audited@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://example.com/a"}
    )
    link_id = created.json()["id"]
    code = created.json()["code"]
    me = await client.get(f"{API}/users/me", headers=user_headers)
    user_id = me.json()["id"]
    headers = await admin_headers()

    await client.patch(
        f"{API}/admin/users/{user_id}", headers=headers, json={"is_active": False}
    )
    await client.patch(
        f"{API}/admin/links/{link_id}", headers=headers, json={"is_active": False}
    )
    await client.delete(f"{API}/admin/links/{link_id}", headers=headers)

    resp = await client.get(f"{API}/admin/audit", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    actions = [item["action"] for item in body["items"]]
    assert actions == ["link.delete", "link.disable", "user.deactivate"]
    delete_entry = body["items"][0]
    assert delete_entry["target_type"] == "link"
    assert delete_entry["target_id"] == code
    assert "example.com/a" in delete_entry["detail"]
