"""add realtime Scam Call Guardian session and risk timeline tables

Revision ID: g4c9e2a1b735
Revises: f3b8c6d1a907
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "g4c9e2a1b735"
down_revision: str | Sequence[str] | None = "f3b8c6d1a907"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def _id_column() -> sa.Column:
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("uuid_generate_v4()"))


def upgrade() -> None:
    op.create_table(
        "scam_sessions",
        _id_column(),
        sa.Column(
            "user_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_risk_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("final_risk_score", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="safe"),
        sa.Column("scam_type", sa.String(80), nullable=True),
        sa.Column("final_recommendation", sa.Text(), nullable=True),
        sa.Column("retain_transcript", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'cancelled', 'interrupted')",
            name="ck_scam_sessions_status",
        ),
        sa.CheckConstraint("max_risk_score BETWEEN 0 AND 100", name="ck_scam_sessions_max_risk_score"),
        sa.CheckConstraint(
            "final_risk_score IS NULL OR final_risk_score BETWEEN 0 AND 100",
            name="ck_scam_sessions_final_risk_score",
        ),
    )
    op.create_index("ix_scam_sessions_user_id", "scam_sessions", ["user_id"])
    op.create_index(
        "ix_scam_sessions_user_status",
        "scam_sessions",
        ["user_id", "status", "started_at"],
    )

    op.create_table(
        "conversation_segments",
        _id_column(),
        sa.Column(
            "session_id",
            UUID,
            sa.ForeignKey("scam_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("speaker", sa.String(30), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=True),
        sa.Column("end_ms", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="browser"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_conversation_segments_session_created",
        "conversation_segments",
        ["session_id", "created_at"],
    )

    op.create_table(
        "scam_signals",
        _id_column(),
        sa.Column(
            "session_id",
            UUID,
            sa.ForeignKey("scam_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "segment_id",
            UUID,
            sa.ForeignKey("conversation_segments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("signal_type", sa.String(60), nullable=False),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=False, server_default="1.0"),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column("evidence", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_scam_signals_session_created",
        "scam_signals",
        ["session_id", "created_at"],
    )

    op.create_table(
        "risk_events",
        _id_column(),
        sa.Column(
            "session_id",
            UUID,
            sa.ForeignKey("scam_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "segment_id",
            UUID,
            sa.ForeignKey("conversation_segments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("signals", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("risk_score BETWEEN 0 AND 100", name="ck_risk_events_score"),
    )
    op.create_index(
        "ix_risk_events_session_created",
        "risk_events",
        ["session_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_risk_events_session_created", table_name="risk_events")
    op.drop_table("risk_events")
    op.drop_index("ix_scam_signals_session_created", table_name="scam_signals")
    op.drop_table("scam_signals")
    op.drop_index(
        "ix_conversation_segments_session_created",
        table_name="conversation_segments",
    )
    op.drop_table("conversation_segments")
    op.drop_index("ix_scam_sessions_user_status", table_name="scam_sessions")
    op.drop_index("ix_scam_sessions_user_id", table_name="scam_sessions")
    op.drop_table("scam_sessions")
