"""add Google federated identity to users

Revision ID: l9f2e6a1b4c3
Revises: k8f5c2d1e3a0
Create Date: 2026-08-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings

revision: str = "l9f2e6a1b4c3"
down_revision: str | Sequence[str] | None = "k8f5c2d1e3a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("users", schema=schema)}
    if "google_subject" not in columns:
        op.add_column(
            "users",
            sa.Column("google_subject", sa.String(length=255), nullable=True),
            schema=schema,
        )

    # Some existing Neon environments received this column before the
    # migration revision was recorded.  Treat the schema as source of truth so
    # upgrading does not fail on a harmless duplicate-column condition.
    unique_sets = [
        set(constraint.get("column_names") or [])
        for constraint in inspector.get_unique_constraints("users", schema=schema)
    ]
    unique_sets.extend(
        set(index.get("column_names") or [])
        for index in inspector.get_indexes("users", schema=schema)
        if index.get("unique")
    )
    if {"google_subject"} not in unique_sets:
        op.create_unique_constraint(
            "uq_users_google_subject",
            "users",
            ["google_subject"],
            schema=schema,
        )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_constraint("uq_users_google_subject", "users", type_="unique", schema=schema)
    op.drop_column("users", "google_subject", schema=schema)
