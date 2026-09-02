"""trust a verified login device for 30 days

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "f7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.add_column(
        "users",
        sa.Column("trusted_device_until", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )
    op.add_column(
        "users",
        sa.Column(
            "last_login_location_confirmed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_column("users", "last_login_location_confirmed_at", schema=schema)
    op.drop_column("users", "trusted_device_until", schema=schema)
