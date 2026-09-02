"""create recipient directory in configured schema

Revision ID: b4c1d8e7f239
Revises: a72d4e0c61b9
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "b4c1d8e7f239"
down_revision: str | Sequence[str] | None = "a72d4e0c61b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create exactly DATABASE_SCHEMA.recipient_directory when it is absent."""
    schema = get_settings().database_schema
    op.execute(
        sa.text(
            f"""
            CREATE TABLE IF NOT EXISTS {schema}.recipient_directory (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                account_number VARCHAR(64) NOT NULL,
                bank_code VARCHAR(32) NOT NULL,
                account_name VARCHAR(255) NOT NULL,
                source VARCHAR(100) NOT NULL DEFAULT 'internal',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (account_number, bank_code)
            )
            """
        )
    )


def downgrade() -> None:
    # The initial directory migration owns the table on clean installations.
    pass
