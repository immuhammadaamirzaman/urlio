"""Link CRUD, custom aliases, URL validation, and owner-scoping tests."""

from __future__ import annotations

from tests.conftest import API


async def test_anonymous_create_has_no_owner(client):
    resp = await client.post(f"{API}/links", json={"target_url": "https://example.com/page"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["owner_id"] is None
    assert body["code"]
    assert body["short_url"].endswith(body["code"])


async def test_authenticated_create_sets_owner(client, register_and_login):
    headers, _ = await register_and_login(email="owner@example.com")
    resp = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/x"}
    )
    assert resp.status_code == 201
    assert resp.json()["owner_id"] is not None


async def test_custom_alias_conflict(client):
    payload = {"target_url": "https://example.com", "custom_alias": "promo2026"}
    first = await client.post(f"{API}/links", json=payload)
    assert first.status_code == 201
    assert first.json()["code"] == "promo2026"
    assert first.json()["is_custom_alias"] is True

    second = await client.post(f"{API}/links", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "alias_conflict"


async def test_reserved_alias_rejected(client):
    resp = await client.post(
        f"{API}/links", json={"target_url": "https://example.com", "custom_alias": "admin"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "reserved_code"


async def test_blocked_scheme_rejected(client):
    resp = await client.post(f"{API}/links", json={"target_url": "javascript:alert(1)"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_url_scheme"


async def test_ssrf_private_host_blocked(client):
    resp = await client.post(f"{API}/links", json={"target_url": "http://127.0.0.1:8080/x"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ssrf_blocked"


async def test_owner_scoping_hides_others_links(client, register_and_login):
    headers_a, _ = await register_and_login(email="a-owner@example.com")
    created = await client.post(
        f"{API}/links", headers=headers_a, json={"target_url": "https://example.com/a"}
    )
    link_id = created.json()["id"]

    headers_b, _ = await register_and_login(email="b-owner@example.com")
    for method in ("get", "patch", "delete"):
        call = getattr(client, method)
        kwargs = {"headers": headers_b}
        if method == "patch":
            kwargs["json"] = {"is_active": False}
        resp = await call(f"{API}/links/{link_id}", **kwargs)
        assert resp.status_code == 404, method


async def test_update_and_delete(client, register_and_login):
    headers, _ = await register_and_login(email="upd@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/old"}
    )
    link_id = created.json()["id"]

    patched = await client.patch(
        f"{API}/links/{link_id}",
        headers=headers,
        json={
            "target_url": "https://example.com/new",
            "is_active": False,
            "expires_at": "2099-01-01T00:00:00Z",
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["target_url"] == "https://example.com/new"
    assert body["is_active"] is False
    assert body["expires_at"].startswith("2099-01-01")

    deleted = await client.delete(f"{API}/links/{link_id}", headers=headers)
    assert deleted.status_code == 204

    missing = await client.get(f"{API}/links/{link_id}", headers=headers)
    assert missing.status_code == 404


async def test_list_links_is_owner_scoped(client, register_and_login):
    headers, _ = await register_and_login(email="lister@example.com")
    for i in range(3):
        await client.post(
            f"{API}/links", headers=headers, json={"target_url": f"https://example.com/{i}"}
        )
    resp = await client.get(f"{API}/links", headers=headers)
    assert resp.status_code == 200
    page = resp.json()
    assert page["total"] == 3
    assert len(page["items"]) == 3


async def test_list_links_search_matches_code_and_target(client, register_and_login):
    headers, _ = await register_and_login(email="search@example.com")
    await client.post(
        f"{API}/links",
        headers=headers,
        json={"target_url": "https://apple.com/", "custom_alias": "fruitbasket"},
    )
    await client.post(
        f"{API}/links",
        headers=headers,
        json={"target_url": "https://microsoft.com/", "custom_alias": "widget"},
    )

    # Match on the target URL.
    by_target = await client.get(f"{API}/links", headers=headers, params={"q": "apple"})
    assert by_target.status_code == 200
    assert by_target.json()["total"] == 1
    assert by_target.json()["items"][0]["code"] == "fruitbasket"

    # Match on the code (case-insensitive).
    by_code = await client.get(f"{API}/links", headers=headers, params={"q": "WIDGET"})
    assert by_code.json()["total"] == 1
    assert by_code.json()["items"][0]["code"] == "widget"

    # No match.
    none = await client.get(f"{API}/links", headers=headers, params={"q": "zzz"})
    assert none.json()["total"] == 0
    assert none.json()["items"] == []


async def test_list_links_filters_by_active_status(client, register_and_login):
    headers, _ = await register_and_login(email="status@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/on"}
    )
    await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/off"}
    )
    await client.patch(
        f"{API}/links/{created.json()['id']}", headers=headers, json={"is_active": False}
    )

    active = await client.get(f"{API}/links", headers=headers, params={"is_active": "true"})
    assert active.json()["total"] == 1
    assert active.json()["items"][0]["is_active"] is True

    inactive = await client.get(
        f"{API}/links", headers=headers, params={"is_active": "false"}
    )
    assert inactive.json()["total"] == 1
    assert inactive.json()["items"][0]["is_active"] is False


async def test_list_links_sort_order_is_reversible(client, register_and_login):
    headers, _ = await register_and_login(email="sort@example.com")
    for i in range(3):
        await client.post(
            f"{API}/links", headers=headers, json={"target_url": f"https://example.com/{i}"}
        )

    desc = await client.get(
        f"{API}/links", headers=headers, params={"sort": "created_at", "order": "desc"}
    )
    asc = await client.get(
        f"{API}/links", headers=headers, params={"sort": "created_at", "order": "asc"}
    )

    codes_desc = [item["code"] for item in desc.json()["items"]]
    codes_asc = [item["code"] for item in asc.json()["items"]]
    assert len(codes_desc) == 3
    # asc and desc are exact reverses (stable, direction-aware tiebreaker).
    assert codes_desc == list(reversed(codes_asc))


async def test_list_links_rejects_invalid_sort(client, register_and_login):
    headers, _ = await register_and_login(email="badsort@example.com")
    resp = await client.get(f"{API}/links", headers=headers, params={"sort": "bogus"})
    assert resp.status_code == 422
