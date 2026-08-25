"""add privacy-preserving transaction risk contexts

Revision ID: a4f0c6d9e318
Revises: f8a29d4c7e51
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a4f0c6d9e318"
down_revision: str | Sequence[str] | None = "f8a29d4c7e51"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "transaction_risk_contexts",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "transaction_id",
            UUID,
            sa.ForeignKey("transactions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_hash", sa.String(length=64), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("geo_lat_e2", sa.Integer(), nullable=True),
        sa.Column("geo_lon_e2", sa.Integer(), nullable=True),
        sa.Column("geo_accuracy_m", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.CheckConstraint(
            "(geo_lat_e2 IS NULL AND geo_lon_e2 IS NULL) OR "
            "(geo_lat_e2 IS NOT NULL AND geo_lon_e2 IS NOT NULL)",
            name="ck_transaction_risk_contexts_geo_pair",
        ),
        sa.CheckConstraint(
            "geo_lat_e2 IS NULL OR geo_lat_e2 BETWEEN -9000 AND 9000",
            name="ck_transaction_risk_contexts_geo_lat",
        ),
        sa.CheckConstraint(
            "geo_lon_e2 IS NULL OR geo_lon_e2 BETWEEN -18000 AND 18000",
            name="ck_transaction_risk_contexts_geo_lon",
        ),
        sa.CheckConstraint(
            "geo_accuracy_m IS NULL OR geo_accuracy_m BETWEEN 0 AND 100000",
            name="ck_transaction_risk_contexts_geo_accuracy",
        ),
    )
    op.create_index(
        "ix_transaction_risk_contexts_user_created",
        "transaction_risk_contexts",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_transaction_risk_contexts_transaction",
        "transaction_risk_contexts",
        ["transaction_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transaction_risk_contexts_transaction", table_name="transaction_risk_contexts")
    op.drop_index("ix_transaction_risk_contexts_user_created", table_name="transaction_risk_contexts")
    op.drop_table("transaction_risk_contexts")
