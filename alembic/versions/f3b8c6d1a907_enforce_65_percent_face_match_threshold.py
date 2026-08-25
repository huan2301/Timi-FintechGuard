"""enforce 65 percent Face ID match threshold

Revision ID: f3b8c6d1a907
Revises: f2c7a9d4b815
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f3b8c6d1a907"
down_revision: str | Sequence[str] | None = "f2c7a9d4b815"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The verification endpoint reads this value from each enrollment, so
    # every current and future reactivated enrollment follows one policy.
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.65 "
            "WHERE similarity_threshold <> 0.65"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE face_enrollments "
            "SET similarity_threshold = 0.88 "
            "WHERE similarity_threshold = 0.65"
        )
    )
