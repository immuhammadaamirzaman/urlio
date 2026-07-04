"""Link list search/sort/filter and country-tracking tests."""

from __future__ import annotations

import uuid

from sqlalchemy import select, update

from app.core.config import settings
from app.main import _flush_once
from app.models.link import Link
from tests.conftest import API


async def _seed_links(client, headers) -> dict[str, dict]:
    payloads = {
        "guides": {
            "target_url": "https://example.com/documentation",
            "custom_alias": "guides",
        },
        "journal": {"target_url": "https://example.com/blog", "custom_alias": "journal"},
        "market": {"target_url": "https://shop.example.org/store", "custom_alias": "market"},
    }
    created = {}
    for name, payload in payloads.items():
        resp = await client.post(f"{API}/links", headers=headers, json=payload)
        assert resp.status_code == 201
        created[name] = resp.json()
    return created


async def test_search_matches_code_and_target(client, register_and_login):
    headers, _ = await register_and_login(email="search@example.com")
    await _seed_links(client, headers)

    by_code = await client.get(f"{API}/links?q=guides", headers=headers)
    assert [item["code"] for item in by_code.json()["items"]] == ["guides"]

    by_target = await client.get(f"{API}/links?q=shop.example", headers=headers)
    assert [item["code"] for item in by_target.json()["items"]] == ["market"]

    none = await client.get(f"{API}/links?q=nomatch", headers=headers)
    assert none.json()["total"] == 0


async def test_filter_by_active_state(client, register_and_login):
    headers, _ = await register_and_login(email="filter2@example.com")
    created = await _seed_links(client, headers)
    await client.patch(
        f"{API}/links/{created['journal']['id']}",
        headers=headers,
        json={"is_active": False},
    )

    active = await client.get(f"{API}/links?is_active=true", headers=headers)
    assert {item["code"] for item in active.json()["items"]} == {"guides", "market"}

    inactive = await client.get(f"{API}/links?is_active=false", headers=headers)
    assert {item["code"] for item in inactive.json()["items"]} == {"journal"}


async def test_sort_by_click_count(client, register_and_login, db_session):
    headers, _ = await register_and_login(email="sorter@example.com")
    created = await _seed_links(client, headers)

    # Simulate flushed click aggregates directly on the rows.
    for code, clicks in (("guides", 5), ("journal", 9), ("market", 1)):
        await db_session.execute(
            update(Link)
            .where(Link.id == uuid.UUID(created[code]["id"]))
            .values(click_count=clicks)
        )
    await db_session.commit()

    resp = await client.get(f"{API}/links?sort=click_count", headers=headers)
    assert [item["code"] for item in resp.json()["items"]] == ["journal", "guides", "market"]

    asc = await client.get(f"{API}/links?sort=click_count&order=asc", headers=headers)
    assert [item["code"] for item in asc.json()["items"]] == ["market", "guides", "journal"]


async def test_invalid_sort_value_is_rejected(client, register_and_login):
    headers, _ = await register_and_login(email="badsort@example.com")
    resp = await client.get(f"{API}/links?sort=hashed_password", headers=headers)
    assert resp.status_code == 422


async def test_country_header_recorded_when_configured(
    client, register_and_login, db_session, fake_redis, monkeypatch
):
    monkeypatch.setattr(settings, "COUNTRY_HEADER", "cf-ipcountry")
    headers, _ = await register_and_login(email="geo@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/geo"}
    )
    code = created.json()["code"]
    link_id = created.json()["id"]

    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "de"})).status_code == 307
    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "DE"})).status_code == 307
    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "PK"})).status_code == 307
    # Unknown sentinel and garbage are stored as no-data, not as countries.
    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "XX"})).status_code == 307
    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "1!"})).status_code == 307

    assert await _flush_once(db_session, fake_redis) == 5

    stats = await client.get(f"{API}/links/{link_id}/stats", headers=headers)
    assert stats.status_code == 200
    top = {c["country"]: c["count"] for c in stats.json()["top_countries"]}
    assert top == {"DE": 2, "PK": 1}


async def test_country_ignored_when_header_not_configured(
    client, register_and_login, db_session, fake_redis
):
    headers, _ = await register_and_login(email="nogeo@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/ng"}
    )
    code = created.json()["code"]

    assert (await client.get(f"/{code}", headers={"cf-ipcountry": "DE"})).status_code == 307
    await _flush_once(db_session, fake_redis)

    result = await db_session.execute(select(Link).where(Link.code == code))
    link = result.scalar_one()
    stats = await client.get(f"{API}/links/{link.id}/stats", headers=headers)
    assert stats.json()["top_countries"] == []
