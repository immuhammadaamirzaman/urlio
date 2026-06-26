"""Analytics schemas. Note: ``ip_hash`` is intentionally never exposed in the API."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMBase


class ClickRead(ORMBase):
    id: uuid.UUID
    link_id: uuid.UUID
    clicked_at: datetime
    referrer: str | None
    user_agent: str | None
    country: str | None


class TimeBucket(BaseModel):
    bucket: datetime
    count: int


class ReferrerCount(BaseModel):
    referrer: str | None
    count: int


class LinkStats(BaseModel):
    link_id: uuid.UUID
    code: str
    total_clicks: int
    unique_ip_estimate: int
    last_clicked_at: datetime | None
    created_at: datetime
    timeseries: list[TimeBucket]
    top_referrers: list[ReferrerCount]
