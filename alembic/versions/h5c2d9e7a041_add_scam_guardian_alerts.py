"""persist critical realtime Guardian alerts

Revision ID: h5c2d9e7a041
Revises: g4c9e2a1b735
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "h5c2d9e7a041"
down_revision: str | Sequence[str] | None = "g4c9e2a1b735"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "scam_alerts",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "session_id",
            UUID,
            sa.ForeignKey("scam_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_scam_alerts_session_created",
        "scam_alerts",
        ["session_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_scam_alerts_session_created", table_name="scam_alerts")
    op.drop_table("scam_alerts")
