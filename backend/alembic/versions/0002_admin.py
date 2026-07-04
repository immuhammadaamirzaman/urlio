"""admin: users.is_superuser + admin_audit table

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-04

"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )

    op.create_table(
        "admin_audit",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("actor_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="fk_admin_audit_actor_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_admin_audit"),
    )
    op.create_index("ix_admin_audit_actor_id", "admin_audit", ["actor_id"], unique=False)
    op.create_index(
        "ix_admin_audit_created_at", "admin_audit", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_table("admin_audit")
    op.drop_column("users", "is_superuser")
