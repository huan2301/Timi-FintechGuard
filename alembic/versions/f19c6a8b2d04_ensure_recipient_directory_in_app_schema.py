"""ensure recipient directory exists in configured application schema

Revision ID: f19c6a8b2d04
Revises: e0182ac925ef
Create Date: 2026-08-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f19c6a8b2d04"
down_revision: str | Sequence[str] | None = "e0182ac925ef"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Repair installs where older revisions ran in PostgreSQL public schema."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS recipient_directory (
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


def downgrade() -> None:
    # e0182ac925ef also owns this table on clean installations.
    pass
