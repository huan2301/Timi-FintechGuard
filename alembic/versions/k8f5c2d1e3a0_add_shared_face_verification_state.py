"""add shared Face ID verification lockout state

Revision ID: k8f5c2d1e3a0
Revises: j7e4b1c9d2f0
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "k8f5c2d1e3a0"
down_revision: str | Sequence[str] | None = "j7e4b1c9d2f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "face_verification_states",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("failure_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO face_verification_states (user_id, failure_count) "
            "SELECT id, 0 FROM users ON CONFLICT (user_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.drop_table("face_verification_states")
