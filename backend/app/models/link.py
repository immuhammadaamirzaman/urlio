"""Link ORM model — a short code mapping to a target URL, optionally owned by a user."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.click import Click
    from app.models.user import User


class Link(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "links"

    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    is_custom_alias: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    hashed_link_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    click_count: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default=text("0")
    )
    last_clicked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    owner: Mapped[User | None] = relationship(back_populates="links")
    clicks: Mapped[list[Click]] = relationship(
        back_populates="link", cascade="all, delete-orphan"
    )

    @property
    def has_password(self) -> bool:
        return self.hashed_link_password is not None

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Link id={self.id} code={self.code!r}>"
