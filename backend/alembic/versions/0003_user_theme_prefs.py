"""add user theme/accent UI preferences

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-05

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "theme",
            sa.String(length=16),
            server_default=sa.text("'system'"),
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "accent",
            sa.String(length=32),
            server_default=sa.text("'blue'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "accent")
    op.drop_column("users", "theme")
