"""ensure recipient directory exists in target schema

Revision ID: a72d4e0c61b9
Revises: f19c6a8b2d04
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from src.app.config import get_settings

revision: str = "a72d4e0c61b9"
down_revision: str | Sequence[str] | None = "f19c6a8b2d04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the directory in DATABASE_SCHEMA, not a visible fallback schema."""
    schema = get_settings().database_schema
    bind = op.get_bind()
    table_exists = bind.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = :schema AND table_name = 'recipient_directory'
            )
            """
        ),
        {"schema": schema},
    ).scalar()
    if table_exists:
        return

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
        sa.Column(
            "source", sa.String(100), nullable=False, server_default=sa.text("'internal'")
        ),
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
        schema=schema,
    )


def downgrade() -> None:
    # The initial directory migration owns the table on clean installations.
    pass
