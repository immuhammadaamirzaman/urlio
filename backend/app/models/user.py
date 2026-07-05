"""User ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.link import Link


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    is_superuser: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # UI preferences. ``theme`` is one of "light"/"dark"/"system"; ``accent`` is either a
    # named preset key (e.g. "blue") or a "#rrggbb" hex string for a custom accent colour.
    theme: Mapped[str] = mapped_column(
        String(16), nullable=False, default="system", server_default=text("'system'")
    )
    accent: Mapped[str] = mapped_column(
        String(32), nullable=False, default="blue", server_default=text("'blue'")
    )

    links: Mapped[list[Link]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<User id={self.id} email={self.email!r}>"
