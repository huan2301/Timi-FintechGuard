"""Durable, payload-free execution telemetry for application agents."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base


class AgentExecutionEvent(Base):
    """One completed invocation, stored without user content or credentials."""

    __tablename__ = "agent_execution_events"
    __table_args__ = (
        CheckConstraint("latency_ms >= 0", name="ck_agent_execution_events_latency"),
        Index(
            "ix_agent_execution_events_agent_occurred",
            "agent_id",
            "occurred_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(80), nullable=False, default="dispatch")
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    # Store only the exception class, never a provider response or user input.
    failure_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
