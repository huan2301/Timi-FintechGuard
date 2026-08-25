"""add indexes for keyset transaction history queries

Revision ID: c8d2e7f5a401
Revises: b6e1f4a9c275
Create Date: 2026-08-15
"""

from collections.abc import Sequence

from alembic import op


revision: str = "c8d2e7f5a401"
down_revision: str | Sequence[str] | None = "b6e1f4a9c275"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL can scan these btree indexes backwards for DESC keyset pages.
    op.create_index(
        "ix_transactions_user_created_id",
        "transactions",
        ["user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_transactions_timi_recipient_created_id",
        "transactions",
        ["timi_recipient_user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_transaction_risk_assessments_transaction_created",
        "transaction_risk_assessments",
        ["transaction_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transaction_risk_assessments_transaction_created",
        table_name="transaction_risk_assessments",
    )
    op.drop_index(
        "ix_transactions_timi_recipient_created_id", table_name="transactions"
    )
    op.drop_index("ix_transactions_user_created_id", table_name="transactions")
