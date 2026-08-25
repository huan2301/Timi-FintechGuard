"""add internal recipient directory

Revision ID: e0182ac925ef
Revises: d7649374920f
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e0182ac925ef"
down_revision: str | Sequence[str] | None = "d7649374920f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipient_directory",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("account_number", sa.String(64), nullable=False),
        sa.Column("bank_code", sa.String(32), nullable=False),
        sa.Column("account_name", sa.String(255), nullable=False),
        sa.Column("source", sa.String(100), nullable=False, server_default="internal"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.UniqueConstraint(
            "account_number", "bank_code", name="uq_recipient_directory_account_bank"
        ),
    )


def downgrade() -> None:
    op.drop_table("recipient_directory")
