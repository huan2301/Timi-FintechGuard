"""add phone-based Timi Bank accounts and internal double-entry ledger

Revision ID: e9f31a7c6b42
Revises: b12a4f7d9c22
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "e9f31a7c6b42"
down_revision: str | Sequence[str] | None = "b12a4f7d9c22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "timi_bank_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # Existing dirty demo data is never silently rewritten. Only users with a
    # valid, non-duplicate phone receive a Timi account on migration; the
    # remaining accounts stay disabled until their phone number is corrected.
    op.execute(
        """
        UPDATE users
        SET timi_bank_enabled = true
        WHERE phone ~ '^[0-9]{8,19}$'
          AND phone IN (
              SELECT phone
              FROM users
              WHERE phone IS NOT NULL
              GROUP BY phone
              HAVING count(*) = 1
          )
        """
    )
    op.create_index(
        "uq_users_timi_bank_phone",
        "users",
        ["phone"],
        unique=True,
        postgresql_where=sa.text("timi_bank_enabled AND phone IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_users_balance_nonnegative", "users", "balance >= 0"
    )
    op.create_check_constraint(
        "ck_users_timi_bank_phone_format",
        "users",
        "NOT timi_bank_enabled OR (phone IS NOT NULL AND phone ~ '^[0-9]{8,19}$')",
    )

    op.add_column(
        "transactions",
        sa.Column("timi_recipient_user_id", UUID, nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_timi_recipient_user_id",
        "transactions",
        "users",
        ["timi_recipient_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_transactions_timi_recipient_user_id",
        "transactions",
        ["timi_recipient_user_id"],
    )

    op.create_table(
        "timi_ledger_entries",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column(
            "transaction_id",
            UUID,
            sa.ForeignKey("transactions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("entry_type", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("balance_after", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.CheckConstraint(
            "entry_type IN ('debit', 'credit')", name="ck_timi_ledger_entry_type"
        ),
        sa.CheckConstraint("amount > 0", name="ck_timi_ledger_amount_positive"),
        sa.CheckConstraint(
            "balance_after >= 0", name="ck_timi_ledger_balance_nonnegative"
        ),
        sa.UniqueConstraint(
            "transaction_id", "entry_type", name="uq_timi_ledger_transaction_side"
        ),
    )
    op.create_index(
        "ix_timi_ledger_entries_user_created",
        "timi_ledger_entries",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_timi_ledger_entries_user_created", table_name="timi_ledger_entries")
    op.drop_table("timi_ledger_entries")

    op.drop_index("ix_transactions_timi_recipient_user_id", table_name="transactions")
    op.drop_constraint(
        "fk_transactions_timi_recipient_user_id", "transactions", type_="foreignkey"
    )
    op.drop_column("transactions", "timi_recipient_user_id")

    op.drop_constraint("ck_users_timi_bank_phone_format", "users", type_="check")
    op.drop_constraint("ck_users_balance_nonnegative", "users", type_="check")
    op.drop_index("uq_users_timi_bank_phone", table_name="users")
    op.drop_column("users", "timi_bank_enabled")
