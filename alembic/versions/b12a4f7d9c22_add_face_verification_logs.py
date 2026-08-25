"""add face verification audit logs

Revision ID: b12a4f7d9c22
Revises: a91f3e2c7b10
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b12a4f7d9c22"
down_revision: str | Sequence[str] | None = "a91f3e2c7b10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "face_verification_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enrollment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("face_enrollments.id", ondelete="SET NULL")),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transactions.id", ondelete="SET NULL")),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("similarity", sa.Numeric(5, 4)),
        sa.Column("threshold", sa.Numeric(5, 4)),
        sa.Column("matched", sa.Boolean(), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("failure_reason", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("purpose IN ('enrollment', 'login', 'transaction')", name="ck_face_verification_logs_purpose"),
    )
    op.create_index("ix_face_verification_logs_user_id", "face_verification_logs", ["user_id"])
    op.create_index("ix_face_verification_logs_transaction_id", "face_verification_logs", ["transaction_id"])


def downgrade() -> None:
    op.drop_index("ix_face_verification_logs_transaction_id", table_name="face_verification_logs")
    op.drop_index("ix_face_verification_logs_user_id", table_name="face_verification_logs")
    op.drop_table("face_verification_logs")
