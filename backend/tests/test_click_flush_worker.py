"""Background click-flush worker tests: single-pass flushing, pacing, and shutdown."""

from __future__ import annotations

import asyncio
import logging
from contextlib import suppress

from sqlalchemy import func, select

from app import main as app_main
from app.core.config import settings
from app.main import _click_flush_worker, _flush_once, lifespan
from app.models.click import Click
from app.models.link import Link
from app.services.analytics import record_click


async def _make_link(db_session, code: str = "wrkr123") -> Link:
    link = Link(code=code, target_url="https://example.com/worker")
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return link


async def test_flush_once_persists_clicks_and_updates_aggregates(db_session, fake_redis):
    link = await _make_link(db_session)

    await record_click(
        fake_redis,
        link_id=link.id,
        referrer="https://ref.example",
        user_agent="pytest",
        ip_hash="h1",
    )
    await record_click(fake_redis, link_id=link.id, referrer=None, user_agent=None, ip_hash=None)

    flushed = await _flush_once(db_session, fake_redis)
    assert flushed == 2

    total = await db_session.scalar(
        select(func.count()).select_from(Click).where(Click.link_id == link.id)
    )
    assert total == 2

    await db_session.refresh(link)
    assert link.click_count == 2
    assert link.last_clicked_at is not None

    # The stream is drained, so a second pass has nothing left to flush.
    assert await _flush_once(db_session, fake_redis) == 0


async def test_flush_once_returns_zero_on_empty_stream(db_session, fake_redis):
    assert await _flush_once(db_session, fake_redis) == 0


async def test_flush_skips_clicks_of_deleted_links(db_session, fake_redis):
    """Queued clicks for a since-deleted link must be acked, not poison the batch."""
    kept = await _make_link(db_session, code="kept123")
    doomed = await _make_link(db_session, code="doomed1")

    await record_click(fake_redis, link_id=kept.id, referrer=None, user_agent=None, ip_hash=None)
    await record_click(fake_redis, link_id=doomed.id, referrer=None, user_agent=None, ip_hash=None)

    await db_session.delete(doomed)
    await db_session.commit()

    # Both events are consumed and acked; only the surviving link gets a row.
    assert await _flush_once(db_session, fake_redis) == 2
    total = await db_session.scalar(select(func.count()).select_from(Click))
    assert total == 1

    await db_session.refresh(kept)
    assert kept.click_count == 1

    # Nothing left pending — the doomed event did not wedge the stream.
    assert await _flush_once(db_session, fake_redis) == 0


async def test_worker_task_cancels_cleanly(monkeypatch):
    first_pass = asyncio.Event()

    async def fake_flush_once():
        first_pass.set()
        return 0

    monkeypatch.setattr(app_main, "_flush_once", fake_flush_once)
    monkeypatch.setattr(settings, "CLICK_FLUSH_INTERVAL_SECONDS", 60.0)

    task = asyncio.create_task(_click_flush_worker())
    await asyncio.wait_for(first_pass.wait(), timeout=1)

    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    assert task.cancelled()


async def test_worker_drains_full_batches_without_sleeping(monkeypatch):
    drained = asyncio.Event()
    calls = {"count": 0}

    async def full_batch_flush_once():
        calls["count"] += 1
        if calls["count"] >= 3:
            drained.set()
            return 0
        return settings.CLICK_FLUSH_BATCH

    monkeypatch.setattr(app_main, "_flush_once", full_batch_flush_once)
    monkeypatch.setattr(settings, "CLICK_FLUSH_INTERVAL_SECONDS", 60.0)

    task = asyncio.create_task(_click_flush_worker())
    # Three passes must complete well before a single 60s sleep could elapse.
    await asyncio.wait_for(drained.wait(), timeout=1)

    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    assert calls["count"] >= 3


async def test_worker_logs_and_survives_flush_errors(monkeypatch, caplog):
    recovered = asyncio.Event()
    calls = {"count": 0}

    async def flaky_flush_once():
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("boom")
        recovered.set()
        return 0

    monkeypatch.setattr(app_main, "_flush_once", flaky_flush_once)
    monkeypatch.setattr(settings, "CLICK_FLUSH_INTERVAL_SECONDS", 0.001)

    with caplog.at_level(logging.WARNING, logger="shortlyx.clickflush"):
        task = asyncio.create_task(_click_flush_worker())
        await asyncio.wait_for(recovered.wait(), timeout=1)

    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    assert "click_flush_failed" in caplog.text


async def test_lifespan_starts_and_cancels_worker_when_enabled(monkeypatch):
    state = {"started": False, "cancelled": False}
    running = asyncio.Event()

    async def fake_worker():
        state["started"] = True
        running.set()
        try:
            await asyncio.Event().wait()  # park until cancelled at shutdown
        except asyncio.CancelledError:
            state["cancelled"] = True
            raise

    monkeypatch.setattr(app_main, "_click_flush_worker", fake_worker)
    monkeypatch.setattr(settings, "CLICK_FLUSH_ENABLED", True)

    async with lifespan(app_main.app):
        await asyncio.wait_for(running.wait(), timeout=1)

    assert state["started"] is True
    assert state["cancelled"] is True


async def test_lifespan_skips_worker_when_disabled(monkeypatch):
    state = {"started": False}

    async def fake_worker():
        state["started"] = True

    monkeypatch.setattr(app_main, "_click_flush_worker", fake_worker)
    monkeypatch.setattr(settings, "CLICK_FLUSH_ENABLED", False)

    async with lifespan(app_main.app):
        await asyncio.sleep(0)

    assert state["started"] is False
