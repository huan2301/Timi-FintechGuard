"""add avatar url to users

Revision ID: c52f24b1fef0
Revises: b4c1d8e7f239
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "c52f24b1fef0"
down_revision: str | Sequence[str] | None = "b4c1d8e7f239"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(length=255), nullable=True),
        schema=get_settings().database_schema,
    )


def downgrade() -> None:
    op.drop_column("users", "avatar_url", schema=get_settings().database_schema)
