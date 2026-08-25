"""require exactly ten digits for Timi Bank phone accounts

Revision ID: f8a29d4c7e51
Revises: e9f31a7c6b42
Create Date: 2026-08-15
"""

from collections.abc import Sequence

from alembic import op


revision: str = "f8a29d4c7e51"
down_revision: str | Sequence[str] | None = "e9f31a7c6b42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Preserve existing phone values but disable internal transfers until the
    # user has a phone number that can safely be used as a 10-digit account.
    op.execute(
        "UPDATE users SET timi_bank_enabled = false "
        "WHERE timi_bank_enabled AND (phone IS NULL OR phone !~ '^[0-9]{10}$')"
    )
    op.drop_constraint("ck_users_timi_bank_phone_format", "users", type_="check")
    op.create_check_constraint(
        "ck_users_timi_bank_phone_format",
        "users",
        "NOT timi_bank_enabled OR (phone IS NOT NULL AND phone ~ '^[0-9]{10}$')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_timi_bank_phone_format", "users", type_="check")
    op.create_check_constraint(
        "ck_users_timi_bank_phone_format",
        "users",
        "NOT timi_bank_enabled OR (phone IS NOT NULL AND phone ~ '^[0-9]{8,19}$')",
    )
