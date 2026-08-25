"""lower active Face ID enrollment threshold to 65 percent

Revision ID: e7b3f1c9a604
Revises: d4a8c2e1b703
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "e7b3f1c9a604"
down_revision: str | Sequence[str] | None = "d4a8c2e1b703"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Threshold is stored per enrollment, so update existing accounts as well
    # as the application's default for future enrollments.
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.65 "
            "WHERE similarity_threshold <> 0.65"
        )
    )


def downgrade() -> None:
    # Restore the prior application-wide threshold. Individual historical
    # overrides are not recoverable because the upgrade intentionally makes
    # all enrollments use one global Face ID policy.
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.88 "
            "WHERE similarity_threshold = 0.65"
        )
    )
