"""add personal saved recipients and merge active migration heads

Revision ID: c4d5e6f7a8b9
Revises: e1f2a3b4c5d6, b5c6d7e8f9a0
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = ("e1f2a3b4c5d6", "b5c6d7e8f9a0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "saved_recipients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_name", sa.String(length=255), nullable=False),
        sa.Column("account_number", sa.String(length=64), nullable=False),
        sa.Column("bank_code", sa.String(length=32), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "account_number",
            "bank_code",
            name="uq_saved_recipient_per_user",
        ),
        schema=schema,
    )
    op.create_index(
        "ix_saved_recipients_user_saved_at",
        "saved_recipients",
        ["user_id", "saved_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index(
        "ix_saved_recipients_user_saved_at",
        table_name="saved_recipients",
        schema=schema,
    )
    op.drop_table("saved_recipients", schema=schema)
