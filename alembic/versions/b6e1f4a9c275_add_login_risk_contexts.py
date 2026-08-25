"""store required login location contexts

Revision ID: b6e1f4a9c275
Revises: a4f0c6d9e318
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "b6e1f4a9c275"
down_revision: str | Sequence[str] | None = "a4f0c6d9e318"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.alter_column(
        "transaction_risk_contexts",
        "transaction_id",
        existing_type=UUID,
        nullable=True,
    )
    op.add_column(
        "transaction_risk_contexts",
        sa.Column(
            "event_type",
            sa.String(length=30),
            nullable=False,
            server_default="transaction_assessment",
        ),
    )
    op.create_check_constraint(
        "ck_transaction_risk_contexts_event_type",
        "transaction_risk_contexts",
        "event_type IN ('login', 'transaction_assessment')",
    )
    op.create_index(
        "ix_transaction_risk_contexts_user_event_created",
        "transaction_risk_contexts",
        ["user_id", "event_type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_transaction_risk_contexts_user_event_created",
        table_name="transaction_risk_contexts",
    )
    op.drop_constraint(
        "ck_transaction_risk_contexts_event_type",
        "transaction_risk_contexts",
        type_="check",
    )
    op.drop_column("transaction_risk_contexts", "event_type")
    op.alter_column(
        "transaction_risk_contexts",
        "transaction_id",
        existing_type=UUID,
        nullable=False,
    )
