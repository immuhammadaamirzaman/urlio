"""AdminAudit ORM model — an append-only log of privileged admin actions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPKMixin


class AdminAudit(UUIDPKMixin, Base):
    __tablename__ = "admin_audit"

    # SET NULL so audit history outlives a deleted admin account.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Stored as a string (UUID or link code) so the row survives target deletion.
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Python-side default (microsecond precision) keeps same-second entries ordered
    # even on dialects whose server clock is second-granular (SQLite in tests).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<AdminAudit id={self.id} action={self.action!r}>"
