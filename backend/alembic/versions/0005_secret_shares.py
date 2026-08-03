"""Create secret shares table

Revision ID: 0005_secret_shares
Revises: 0004_user_soft_delete
Create Date: 2026-07-25 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0005_secret_shares"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "secret_shares",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=True),
        sa.Column("nonce", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_secret_shares_token"), "secret_shares", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_secret_shares_token"), table_name="secret_shares")
    op.drop_table("secret_shares")
