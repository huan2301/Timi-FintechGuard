"""persist agent execution metrics for the admin dashboard

Revision ID: e1f2a3b4c5d6
Revises: d7e8f9a0b1c2
Create Date: 2026-08-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from src.app.config import get_settings


revision: str = "e1f2a3b4c5d6"
down_revision: str | Sequence[str] | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "agent_execution_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.String(length=64), nullable=False),
        sa.Column("operation", sa.String(length=80), nullable=False, server_default="dispatch"),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("failure_type", sa.String(length=120), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("latency_ms >= 0", name="ck_agent_execution_events_latency"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_agent_execution_events_agent_id",
        "agent_execution_events",
        ["agent_id"],
        unique=False,
        schema=schema,
    )
    op.create_index(
        "ix_agent_execution_events_agent_occurred",
        "agent_execution_events",
        ["agent_id", "occurred_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index(
        "ix_agent_execution_events_agent_occurred",
        table_name="agent_execution_events",
        schema=schema,
    )
    op.drop_index(
        "ix_agent_execution_events_agent_id",
        table_name="agent_execution_events",
        schema=schema,
    )
    op.drop_table("agent_execution_events", schema=schema)
