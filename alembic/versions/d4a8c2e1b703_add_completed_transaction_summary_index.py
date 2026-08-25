"""add partial index for completed transaction daily summary

Revision ID: d4a8c2e1b703
Revises: c8d2e7f5a401
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "d4a8c2e1b703"
down_revision: str | Sequence[str] | None = "c8d2e7f5a401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_transactions_user_completed_created",
        "transactions",
        ["user_id", "created_at"],
        postgresql_where=sa.text("transaction_status = 'completed'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transactions_user_completed_created",
        table_name="transactions",
    )
