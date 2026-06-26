"""Click ORM model — one row per redirect, written asynchronously off the hot path."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.link import Link


class Click(UUIDPKMixin, Base):
    __tablename__ = "clicks"
    __table_args__ = (
        Index("ix_clicks_link_id_clicked_at", "link_id", "clicked_at"),
    )

    link_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("links.id", ondelete="CASCADE"),
        nullable=False,
    )
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    referrer: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    country: Mapped[str | None] = mapped_column(String(2), nullable=True)

    link: Mapped[Link] = relationship(back_populates="clicks")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Click id={self.id} link_id={self.link_id}>"
