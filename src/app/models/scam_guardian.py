"""Persistence models for realtime Scam Call Guardian sessions."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class ScamGuardianSession(Base, TimestampMixin):
    __tablename__ = "scam_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'completed', 'cancelled', 'interrupted')",
            name="ck_scam_sessions_status",
        ),
        CheckConstraint(
            "max_risk_score BETWEEN 0 AND 100",
            name="ck_scam_sessions_max_risk_score",
        ),
        CheckConstraint(
            "final_risk_score IS NULL OR final_risk_score BETWEEN 0 AND 100",
            name="ck_scam_sessions_final_risk_score",
        ),
        CheckConstraint(
            "agent_action IN ('CONTINUE', 'MONITOR', 'PAUSE', 'STOP')",
            name="ck_scam_sessions_agent_action",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    started_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    max_risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    final_risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="safe", nullable=False)
    scam_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Last action selected by the Guardian agent. This is the only value the
    # transaction API uses for enforcement; it does not derive a threshold
    # from max_risk_score.
    agent_action: Mapped[str] = mapped_column(String(20), default="CONTINUE", nullable=False)
    final_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    retain_transcript: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ScamConversationSegment(Base):
    __tablename__ = "conversation_segments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scam_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    speaker: Mapped[str] = mapped_column(String(30), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    start_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    source: Mapped[str] = mapped_column(String(30), default="browser", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)


class ScamSignal(Base):
    __tablename__ = "scam_signals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scam_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversation_segments.id", ondelete="SET NULL"),
        nullable=True,
    )
    signal_type: Mapped[str] = mapped_column(String(60), nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False, default=1.0)
    weight: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)


class ScamRiskEvent(Base):
    __tablename__ = "risk_events"
    __table_args__ = (
        CheckConstraint(
            "recommended_action IN ('CONTINUE', 'MONITOR', 'PAUSE', 'STOP')",
            name="ck_risk_events_recommended_action",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scam_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversation_segments.id", ondelete="SET NULL"),
        nullable=True,
    )
    risk_score: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    recommended_action: Mapped[str] = mapped_column(String(20), nullable=False, default="CONTINUE")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    signals: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)


class ScamAlert(Base):
    """A user-facing alert emitted when the Guardian agent selects STOP."""

    __tablename__ = "scam_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scam_sessions.id", ondelete="CASCADE"),
        index=True,
    )
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)
