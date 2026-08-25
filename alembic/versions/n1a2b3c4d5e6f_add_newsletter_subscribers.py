"""add public newsletter subscribers

Revision ID: n1a2b3c4d5e6f
Revises: m0a1f3c8d4e6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from src.app.config import get_settings

revision: str = "n1a2b3c4d5e6f"
down_revision: str | Sequence[str] | None = "m0a1f3c8d4e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "newsletter_subscribers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        schema=schema,
    )
    op.create_index(
        "ix_newsletter_subscribers_email",
        "newsletter_subscribers",
        ["email"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_newsletter_subscribers_email", table_name="newsletter_subscribers", schema=schema)
    op.drop_table("newsletter_subscribers", schema=schema)
