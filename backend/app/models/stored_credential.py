"""Encrypted credential vault — stores user credentials encrypted with AES-256-GCM."""

from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class StoredCredential(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "stored_credentials"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Plaintext label for listing without requiring the master password
    detail: Mapped[str] = mapped_column(String(255), nullable=False)
    # Base64-encoded AES-256-GCM ciphertext (encrypted JSON blob of sensitive fields)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    # Base64-encoded 16-byte PBKDF2 salt
    salt: Mapped[str] = mapped_column(String(44), nullable=False)
    # Base64-encoded 12-byte GCM nonce
    nonce: Mapped[str] = mapped_column(String(24), nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<StoredCredential id={self.id} detail={self.detail!r}>"
