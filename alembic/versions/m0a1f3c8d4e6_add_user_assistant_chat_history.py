"""add user-isolated assistant chat history

Revision ID: m0a1f3c8d4e6
Revises: l9f2e6a1b4c3
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "m0a1f3c8d4e6"
down_revision: str | Sequence[str] | None = "l9f2e6a1b4c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "assistant_chat_exchanges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("question_hash", sa.String(length=64), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("out_of_scope", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("response_source", sa.String(length=20), nullable=False),
        sa.Column("cache_version", sa.String(length=32), nullable=False),
        sa.Column("reuse_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_reused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_assistant_chat_exchanges_user_cache",
        "assistant_chat_exchanges",
        ["user_id", "question_hash", "cache_version", "expires_at"],
        unique=False,
        schema=schema,
    )
    op.create_index(
        "ix_assistant_chat_exchanges_user_created",
        "assistant_chat_exchanges",
        ["user_id", "created_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_assistant_chat_exchanges_user_created", table_name="assistant_chat_exchanges", schema=schema)
    op.drop_index("ix_assistant_chat_exchanges_user_cache", table_name="assistant_chat_exchanges", schema=schema)
    op.drop_table("assistant_chat_exchanges", schema=schema)
