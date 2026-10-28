"""One-time secret shares stored encrypted and consumed exactly once."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class SecretShare(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "secret_shares"

    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    nonce: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Chosen by the sender at creation time: when set, the link refuses to open for an
    # anonymous visitor (see app.services.secrets.open_secret_share). Defaults to False so
    # the plain "anyone with the link" share stays the unsurprising case.
    require_auth: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<SecretShare id={self.id} token={self.token!r}>"
