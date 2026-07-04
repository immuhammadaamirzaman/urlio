"""email verification: users.email_verified

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-04

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
            "email_verified",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    # Accounts created before verification existed are grandfathered in as verified;
    # only registrations from this release onward must prove address ownership.
    op.execute("UPDATE users SET email_verified = true")


def downgrade() -> None:
    op.drop_column("users", "email_verified")
