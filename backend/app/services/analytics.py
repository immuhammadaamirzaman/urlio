"""Click analytics: off-hot-path recording, stream flushing, and aggregate stats.

The redirect path only calls :func:`record_click`, which does an O(1) Redis ``INCR`` plus
an ``XADD`` onto a stream and never raises into the request. A background worker (or the
test harness) calls :func:`flush_click_stream` to durably persist click rows and reconcile
the per-link aggregate count.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Literal

from redis.asyncio import Redis
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis import click_count_key
from app.core.config import settings
from app.models.click import Click
from app.models.link import Link
from app.schemas.analytics import CountryCount, LinkStats, ReferrerCount, TimeBucket

logger = logging.getLogger("shortlyx.analytics")


async def record_click(
    redis: Redis,
    *,
    link_id: uuid.UUID,
    referrer: str | None,
    user_agent: str | None,
    ip_hash: str | None,
    country: str | None = None,
    clicked_at: datetime | None = None,
) -> None:
    """Record a click off the hot path. Never raises into the request."""
    try:
        clicked = clicked_at or datetime.now(UTC)
        await redis.incr(click_count_key(link_id))
        await redis.xadd(
            settings.CLICK_STREAM_KEY,
            {
                "link_id": str(link_id),
                "clicked_at": clicked.isoformat(),
                "referrer": referrer or "",
                "user_agent": user_agent or "",
                "ip_hash": ip_hash or "",
                "country": country or "",
            },
            maxlen=settings.CLICK_STREAM_MAXLEN,
            approximate=True,
        )
    except Exception:  # pragma: no cover - defensive; analytics must never break redirects
        logger.warning("record_click_failed", exc_info=True)


async def flush_click_stream(
    session: AsyncSession, redis: Redis, *, batch: int | None = None
) -> int:
    """Drain pending click events into the database. Returns the number flushed."""
    batch = batch or settings.CLICK_FLUSH_BATCH
    stream = settings.CLICK_STREAM_KEY
    group = settings.CLICK_CONSUMER_GROUP

    try:
        await redis.xgroup_create(stream, group, id="0", mkstream=True)
    except Exception as exc:  # noqa: BLE001 - BUSYGROUP just means the group exists
        if "BUSYGROUP" not in str(exc):
            raise

    entries = await redis.xreadgroup(group, "flusher", {stream: ">"}, count=batch)
    if not entries:
        return 0

    rows: list[Click] = []
    ack_ids: list[str] = []
    counts: dict[uuid.UUID, int] = {}
    last_clicked: dict[uuid.UUID, datetime] = {}

    for _stream_name, messages in entries:
        for msg_id, fields in messages:
            ack_ids.append(msg_id)
            link_id = uuid.UUID(fields["link_id"])
            clicked_at = datetime.fromisoformat(fields["clicked_at"])
            rows.append(
                Click(
                    link_id=link_id,
                    clicked_at=clicked_at,
                    referrer=fields.get("referrer") or None,
                    user_agent=fields.get("user_agent") or None,
                    ip_hash=fields.get("ip_hash") or None,
                    country=fields.get("country") or None,
                )
            )
            counts[link_id] = counts.get(link_id, 0) + 1
            prev = last_clicked.get(link_id)
            last_clicked[link_id] = clicked_at if prev is None else max(prev, clicked_at)

    if rows:
        session.add_all(rows)
        for link_id, count in counts.items():
            await session.execute(
                update(Link)
                .where(Link.id == link_id)
                .values(
                    click_count=Link.click_count + count,
                    last_clicked_at=last_clicked[link_id],
                )
            )
        await session.commit()

    if ack_ids:
        await redis.xack(stream, group, *ack_ids)
    return len(ack_ids)


def _bucket_expr(dialect: str, column, bucket: str):
    """Dialect-agnostic time-bucketing expression."""
    if dialect == "postgresql":
        return func.date_trunc(bucket, column)
    fmt = "%Y-%m-%d %H:00:00" if bucket == "hour" else "%Y-%m-%d"
    return func.strftime(fmt, column)


async def get_link_stats(
    session: AsyncSession,
    redis: Redis,
    link: Link,
    *,
    bucket: Literal["hour", "day"] = "day",
    limit_buckets: int = 30,
) -> LinkStats:
    """Aggregate click statistics for a link."""
    dialect = session.get_bind().dialect.name

    raw_count = await redis.get(click_count_key(link.id))
    total_clicks = int(raw_count) if raw_count is not None else link.click_count

    unique_ips = await session.scalar(
        select(func.count(func.distinct(Click.ip_hash))).where(
            Click.link_id == link.id, Click.ip_hash.is_not(None)
        )
    )

    bucket_col = _bucket_expr(dialect, Click.clicked_at, bucket).label("bucket")
    ts_rows = (
        await session.execute(
            select(bucket_col, func.count().label("cnt"))
            .where(Click.link_id == link.id)
            .group_by(bucket_col)
            .order_by(bucket_col.desc())
            .limit(limit_buckets)
        )
    ).all()
    timeseries = [TimeBucket(bucket=row.bucket, count=row.cnt) for row in ts_rows]
    timeseries.reverse()

    ref_rows = (
        await session.execute(
            select(Click.referrer, func.count().label("cnt"))
            .where(Click.link_id == link.id)
            .group_by(Click.referrer)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    top_referrers = [ReferrerCount(referrer=row.referrer, count=row.cnt) for row in ref_rows]

    country_rows = (
        await session.execute(
            select(Click.country, func.count().label("cnt"))
            .where(Click.link_id == link.id, Click.country.is_not(None))
            .group_by(Click.country)
            .order_by(func.count().desc())
            .limit(10)
        )
    ).all()
    top_countries = [CountryCount(country=row.country, count=row.cnt) for row in country_rows]

    return LinkStats(
        link_id=link.id,
        code=link.code,
        total_clicks=total_clicks,
        unique_ip_estimate=int(unique_ips or 0),
        last_clicked_at=link.last_clicked_at,
        created_at=link.created_at,
        timeseries=timeseries,
        top_referrers=top_referrers,
        top_countries=top_countries,
    )


async def list_clicks(
    session: AsyncSession, link_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Click], int]:
    """List click rows for a link, newest first, with total count."""
    total = await session.scalar(
        select(func.count()).select_from(Click).where(Click.link_id == link_id)
    )
    result = await session.execute(
        select(Click)
        .where(Click.link_id == link_id)
        .order_by(Click.clicked_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), int(total or 0)
