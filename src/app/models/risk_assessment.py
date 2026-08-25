from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.blacklist import Blacklist
    from src.app.models.intervention_log import InterventionLog
    from src.app.models.scam_pattern import ScamPattern
    from src.app.models.transaction import Transaction
    from src.app.models.user import User


class RiskLevel:
    SAFE = "safe"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class WarningDecision:
    PROCEEDED = "proceeded"
    CANCELLED = "cancelled"


class TransactionRiskAssessment(Base):
    __tablename__ = "transaction_risk_assessments"
    __table_args__ = (
        CheckConstraint("risk_score BETWEEN 0 AND 1", name="ck_assessment_score"),
        CheckConstraint(
            "risk_level IN ('safe', 'low', 'medium', 'high')",
            name="ck_assessment_level",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    should_warn: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rules_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    blacklist_match_found: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    raw_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)

    transaction: Mapped["Transaction"] = relationship(back_populates="assessments")
    signals: Mapped[list["RiskSignal"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )
    warnings: Mapped[list["TransactionWarning"]] = relationship(back_populates="assessment")


class RiskSignal(Base):
    __tablename__ = "risk_signals"
    __table_args__ = (
        CheckConstraint(
            "severity IN ('info', 'low', 'medium', 'high')",
            name="ck_risk_signals_severity",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transaction_risk_assessments.id", ondelete="CASCADE"),
        index=True,
    )
    signal_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    score: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    matched_blacklist_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("blacklist.id", ondelete="SET NULL"), nullable=True
    )
    matched_pattern_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scam_patterns.id", ondelete="SET NULL"), nullable=True
    )
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)

    assessment: Mapped["TransactionRiskAssessment"] = relationship(back_populates="signals")
    matched_blacklist: Mapped["Blacklist | None"] = relationship(back_populates="matched_signals")
    matched_pattern: Mapped["ScamPattern | None"] = relationship(back_populates="matched_signals")


class TransactionWarning(Base, TimestampMixin):
    __tablename__ = "transaction_warnings"
    __table_args__ = (
        CheckConstraint(
            "warning_level IN ('medium', 'high')", name="ck_transaction_warnings_level"
        ),
        CheckConstraint(
            "countdown_seconds BETWEEN 0 AND 60",
            name="ck_transaction_warnings_countdown",
        ),
        CheckConstraint(
            "user_decision IS NULL OR user_decision IN ('proceeded', 'cancelled')",
            name="ck_transaction_warnings_decision",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    assessment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transaction_risk_assessments.id"), index=True
    )
    warning_level: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    transparency_reason: Mapped[str] = mapped_column(Text, nullable=False)
    displayed_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)
    countdown_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    user_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    verification_confirmed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verification_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)

    transaction: Mapped["Transaction"] = relationship(back_populates="warnings")
    assessment: Mapped["TransactionRiskAssessment"] = relationship(back_populates="warnings")
    feedback: Mapped["WarningFeedback | None"] = relationship(
        back_populates="warning", uselist=False, cascade="all, delete-orphan"
    )
    intervention_logs: Mapped[list["InterventionLog"]] = relationship(back_populates="warning")


class WarningFeedback(Base):
    __tablename__ = "warning_feedback"
    __table_args__ = (
        CheckConstraint(
            "feedback_type IN ('helpful', 'false_positive', 'confirmed_scam', 'not_helpful', 'unsure')",
            name="ck_warning_feedback_type",
        ),
        CheckConstraint(
            "review_status IN ('pending', 'validated', 'rejected')",
            name="ck_warning_feedback_review_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    warning_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transaction_warnings.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    feedback_type: Mapped[str] = mapped_column(String(30), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)

    warning: Mapped["TransactionWarning"] = relationship(back_populates="feedback")
    user: Mapped["User"] = relationship(
        back_populates="warning_feedback", foreign_keys=[user_id]
    )
