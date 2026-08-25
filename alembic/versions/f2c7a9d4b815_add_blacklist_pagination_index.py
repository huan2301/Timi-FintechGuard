"""add index for newest-first blacklist pages

Revision ID: f2c7a9d4b815
Revises: e7b3f1c9a604
Create Date: 2026-08-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f2c7a9d4b815"
down_revision: str | Sequence[str] | None = "e7b3f1c9a604"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL scans this btree backwards for DESC/DESC keyset pagination.
    op.create_index("ix_blacklist_created_at_id", "blacklist", ["created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_blacklist_created_at_id", table_name="blacklist")
