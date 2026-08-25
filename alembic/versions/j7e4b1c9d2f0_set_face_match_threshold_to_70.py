"""set Face ID enrollment match threshold to 70 percent

Revision ID: j7e4b1c9d2f0
Revises: i6d3f8a2b941
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "j7e4b1c9d2f0"
down_revision: str | Sequence[str] | None = "i6d3f8a2b941"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.70 "
            "WHERE similarity_threshold <> 0.70"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.65 "
            "WHERE similarity_threshold = 0.70"
        )
    )
