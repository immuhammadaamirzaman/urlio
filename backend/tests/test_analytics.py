"""Click analytics tests: recording, flushing, stats, and owner-scoping."""

from __future__ import annotations

import uuid

from app.services.analytics import flush_click_stream
from tests.conftest import API


async def test_click_recorded_and_counted(client, fake_redis, db_session, register_and_login):
    headers, _ = await register_and_login(email="stats@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/a"}
    )
    link = created.json()

    # A redirect fires the (background) click recording.
    await client.get(f"/{link['code']}")

    # The aggregate counter is incremented immediately in Redis.
    assert await fake_redis.get(f"clicks:count:{link['id']}") == "1"

    # Flushing the stream durably persists the click row.
    flushed = await flush_click_stream(db_session, fake_redis)
    assert flushed >= 1


async def test_stats_endpoint_reflects_clicks(client, register_and_login):
    headers, _ = await register_and_login(email="stats2@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/b"}
    )
    link = created.json()

    await client.get(f"/{link['code']}")

    stats = await client.get(f"{API}/links/{link['id']}/stats", headers=headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["total_clicks"] >= 1
    assert body["code"] == link["code"]


async def test_clicks_list_hides_ip_hash(client, fake_redis, db_session, register_and_login):
    headers, _ = await register_and_login(email="stats3@example.com")
    created = await client.post(
        f"{API}/links", headers=headers, json={"target_url": "https://example.com/c"}
    )
    link = created.json()

    await client.get(f"/{link['code']}")
    await flush_click_stream(db_session, fake_redis)

    resp = await client.get(f"{API}/links/{link['id']}/clicks", headers=headers)
    assert resp.status_code == 200
    page = resp.json()
    assert page["total"] >= 1
    for item in page["items"]:
        assert "ip_hash" not in item


async def test_stats_owner_only(client, register_and_login):
    headers_a, _ = await register_and_login(email="a-stats@example.com")
    created = await client.post(
        f"{API}/links", headers=headers_a, json={"target_url": "https://example.com/d"}
    )
    link = created.json()

    headers_b, _ = await register_and_login(email="b-stats@example.com")
    resp = await client.get(f"{API}/links/{link['id']}/stats", headers=headers_b)
    assert resp.status_code == 404


async def test_stats_for_unknown_link_404(client, register_and_login):
    headers, _ = await register_and_login(email="unknown-stats@example.com")
    resp = await client.get(f"{API}/links/{uuid.uuid4()}/stats", headers=headers)
    assert resp.status_code == 404
