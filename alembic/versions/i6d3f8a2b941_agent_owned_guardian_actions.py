"""store agent-owned Guardian actions for backend enforcement

Revision ID: i6d3f8a2b941
Revises: h5c2d9e7a041
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "i6d3f8a2b941"
down_revision: str | Sequence[str] | None = "h5c2d9e7a041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scam_sessions",
        sa.Column("agent_action", sa.String(length=20), nullable=False, server_default="CONTINUE"),
    )
    op.add_column(
        "risk_events",
        sa.Column("recommended_action", sa.String(length=20), nullable=False, server_default="CONTINUE"),
    )
    op.create_check_constraint(
        "ck_scam_sessions_agent_action",
        "scam_sessions",
        "agent_action IN ('CONTINUE', 'MONITOR', 'PAUSE', 'STOP')",
    )
    op.create_check_constraint(
        "ck_risk_events_recommended_action",
        "risk_events",
        "recommended_action IN ('CONTINUE', 'MONITOR', 'PAUSE', 'STOP')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_risk_events_recommended_action", "risk_events", type_="check")
    op.drop_constraint("ck_scam_sessions_agent_action", "scam_sessions", type_="check")
    op.drop_column("risk_events", "recommended_action")
    op.drop_column("scam_sessions", "agent_action")
