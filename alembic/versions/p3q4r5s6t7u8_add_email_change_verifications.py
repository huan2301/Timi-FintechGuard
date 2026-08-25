"""add email change verification records"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "p3q4r5s6t7u8"
down_revision: str | Sequence[str] | None = "o2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "email_change_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("current_email", sa.String(length=255), nullable=False),
        sa.Column("new_email", sa.String(length=255), nullable=False),
        sa.Column("old_otp_hash", sa.String(length=64), nullable=False),
        sa.Column("new_otp_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        schema=schema,
    )
    op.create_index("ix_email_change_verifications_user_id", "email_change_verifications", ["user_id"], schema=schema)


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_email_change_verifications_user_id", table_name="email_change_verifications", schema=schema)
    op.drop_table("email_change_verifications", schema=schema)
