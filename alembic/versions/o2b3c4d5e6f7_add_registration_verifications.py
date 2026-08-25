"""add registration email verification records"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "o2b3c4d5e6f7"
down_revision: str | Sequence[str] | None = "n1a2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "registration_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("otp_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        schema=schema,
    )
    op.create_index("ix_registration_verifications_email", "registration_verifications", ["email"], schema=schema)


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_registration_verifications_email", table_name="registration_verifications", schema=schema)
    op.drop_table("registration_verifications", schema=schema)
