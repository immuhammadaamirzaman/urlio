"""Admin (superuser) endpoint tests: authz, user/link management, stats, audit."""

from __future__ import annotations

from sqlalchemy import update as sa_update

from app.models.user import User
from app.services.analytics import flush_click_stream
from tests.conftest import API


async def _make_admin(
    client, db_session, email: str = "admin@example.com", password: str = "password123"
) -> dict[str, str]:
    """Register a user, promote to superuser in the DB, and return auth headers."""
    await client.post(f"{API}/auth/register", json={"email": email, "password": password})
    await db_session.execute(
        sa_update(User).where(User.email == email).values(is_superuser=True)
    )
    await db_session.commit()
    resp = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _user_headers(client, email: str, password: str = "password123") -> dict[str, str]:
    await client.post(f"{API}/auth/register", json={"email": email, "password": password})
    resp = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_admin_endpoints_require_superuser(client, register_and_login):
    headers, _ = await register_and_login(email="plain@example.com")
    for path in ("/admin/users", "/admin/links", "/admin/stats", "/admin/audit"):
        resp = await client.get(f"{API}{path}", headers=headers)
        assert resp.status_code == 403, path
        assert resp.json()["error"]["code"] == "not_authorized"


async def test_admin_endpoints_require_auth(client):
    # HTTPBearer returns 403 when the Authorization header is absent entirely.
    resp = await client.get(f"{API}/admin/stats")
    assert resp.status_code == 403


async def test_admin_list_users_with_search_and_link_count(client, db_session):
    admin = await _make_admin(client, db_session)
    user_headers = await _user_headers(client, "linky@example.com")
    for i in range(2):
        await client.post(
            f"{API}/links", headers=user_headers, json={"target_url": f"https://ex.com/{i}"}
        )

    listing = await client.get(f"{API}/admin/users", headers=admin, params={"q": "linky"})
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["email"] == "linky@example.com"
    assert row["link_count"] == 2


async def test_admin_deactivate_user_and_disable_links(client, db_session):
    admin = await _make_admin(client, db_session)
    user_headers = await _user_headers(client, "victim@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://ex.com/x"}
    )
    code = created.json()["code"]

    # Find the victim's id.
    users = await client.get(f"{API}/admin/users", headers=admin, params={"q": "victim"})
    victim_id = users.json()["items"][0]["id"]

    resp = await client.patch(
        f"{API}/admin/users/{victim_id}",
        headers=admin,
        json={"is_active": False, "disable_links": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    # Their link was deactivated too → redirect no longer resolves as active (404).
    redirect = await client.get(f"/{code}", follow_redirects=False)
    assert redirect.status_code == 404
    # And the deactivated user can no longer authenticate.
    relogin = await client.post(
        f"{API}/auth/login", json={"email": "victim@example.com", "password": "password123"}
    )
    assert relogin.status_code == 403


async def test_admin_cannot_deactivate_self(client, db_session):
    admin = await _make_admin(client, db_session)
    me = await client.get(f"{API}/admin/users", headers=admin, params={"q": "admin@"})
    admin_id = me.json()["items"][0]["id"]
    resp = await client.patch(
        f"{API}/admin/users/{admin_id}",
        headers=admin,
        json={"is_active": False, "disable_links": False},
    )
    assert resp.status_code == 403


async def test_admin_list_links_with_owner_email_and_filter(client, db_session):
    admin = await _make_admin(client, db_session)
    user_headers = await _user_headers(client, "owner@example.com")
    await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://owned.com/x"}
    )
    # An anonymous link (no owner).
    await client.post(f"{API}/links", json={"target_url": "https://anon.com/y"})

    listing = await client.get(f"{API}/admin/links", headers=admin)
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert listing.json()["total"] == 2
    emails = {item["owner_email"] for item in items}
    assert "owner@example.com" in emails
    assert None in emails  # the anonymous link

    # Search filter narrows to the owned link.
    filtered = await client.get(f"{API}/admin/links", headers=admin, params={"q": "owned"})
    assert filtered.json()["total"] == 1


async def test_admin_set_link_active_and_delete(client, db_session):
    admin = await _make_admin(client, db_session)
    created = await client.post(f"{API}/links", json={"target_url": "https://ex.com/z"})
    link_id = created.json()["id"]
    code = created.json()["code"]

    deactivated = await client.patch(
        f"{API}/admin/links/{link_id}", headers=admin, json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    # Cache was invalidated → redirect reflects the new inactive state.
    assert (await client.get(f"/{code}", follow_redirects=False)).status_code == 404

    deleted = await client.delete(f"{API}/admin/links/{link_id}", headers=admin)
    assert deleted.status_code == 204
    assert (await client.get(f"/{code}", follow_redirects=False)).status_code == 404


async def test_admin_stats(client, db_session, fake_redis):
    admin = await _make_admin(client, db_session)
    user_headers = await _user_headers(client, "statsuser@example.com")
    created = await client.post(
        f"{API}/links", headers=user_headers, json={"target_url": "https://ex.com/s"}
    )
    await client.get(f"/{created.json()['code']}")  # generate a click
    # Clicks persist to Link.click_count only once the stream is flushed.
    await flush_click_stream(db_session, fake_redis)

    resp = await client.get(f"{API}/admin/stats", headers=admin)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_users"] >= 2  # admin + statsuser
    assert body["total_links"] >= 1
    assert body["total_clicks"] >= 1
    assert isinstance(body["clicks_per_day"], list)


async def test_admin_audit_log_records_mutations(client, db_session):
    admin = await _make_admin(client, db_session)
    created = await client.post(f"{API}/links", json={"target_url": "https://ex.com/a"})
    link_id = created.json()["id"]
    await client.delete(f"{API}/admin/links/{link_id}", headers=admin)

    audit = await client.get(f"{API}/admin/audit", headers=admin)
    assert audit.status_code == 200
    actions = [entry["action"] for entry in audit.json()["items"]]
    assert "link.deleted" in actions
