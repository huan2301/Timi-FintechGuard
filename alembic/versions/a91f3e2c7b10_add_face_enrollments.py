"""add biometric face enrollments in the configured application schema

Revision ID: a91f3e2c7b10
Revises: f19c6a8b2d04, c52f24b1fef0
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a91f3e2c7b10"
down_revision: str | Sequence[str] | None = ("f19c6a8b2d04", "c52f24b1fef0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "face_enrollments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("reference_image_url", sa.String(500), nullable=False),
        sa.Column("reference_embedding", postgresql.JSONB(), nullable=False),
        sa.Column("model_id", sa.String(255), nullable=False),
        sa.Column("similarity_threshold", sa.Numeric(5, 4), nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("metadata_json", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_face_enrollments_user_id", "face_enrollments", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_face_enrollments_user_id", table_name="face_enrollments")
    op.drop_table("face_enrollments")
