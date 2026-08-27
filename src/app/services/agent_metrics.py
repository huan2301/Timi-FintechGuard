"""Durable operational metrics for specialist agents.

Every completed invocation is stored as a small, payload-free event in
PostgreSQL. The admin dashboard aggregates these events from Neon, so a
backend restart never resets calls, success rate, latency, or last activity.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from src.app.db.session import SessionLocal
from src.app.models.agent_execution_event import AgentExecutionEvent

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AgentMetricSnapshot:
    agent_id: str
    calls: int
    successful_calls: int
    failed_calls: int
    success_rate: float | None
    avg_latency_ms: float | None
    last_activity_at: datetime | None


def record_agent_call(
    agent_id: str,
    *,
    latency_ms: float,
    success: bool,
    operation: str = "dispatch",
    failure_type: str | None = None,
) -> None:
    """Persist one execution outcome without coupling it to business writes.

    Metrics must never make chat, Guardian, or transaction safety unavailable.
    A separate short-lived database session is therefore used, and it stores no
    payload, transcript, account number, or provider response.
    """

    db: Session | None = None
    try:
        db = SessionLocal()
        db.add(
            AgentExecutionEvent(
                agent_id=agent_id[:64],
                operation=operation[:80] or "dispatch",
                success=success,
                latency_ms=max(0, round(latency_ms)),
                failure_type=failure_type[:120] if failure_type else None,
            )
        )
        db.commit()
    except Exception:
        if db is not None:
            db.rollback()
        logger.warning("Could not persist agent execution metric", exc_info=True)
    finally:
        if db is not None:
            db.close()


def get_persisted_metrics(
    db: Session,
    agent_ids: list[str] | tuple[str, ...],
) -> dict[str, AgentMetricSnapshot]:
    """Aggregate durable metrics for the requested agent IDs from Neon."""

    snapshots = {
        agent_id: AgentMetricSnapshot(
            agent_id=agent_id,
            calls=0,
            successful_calls=0,
            failed_calls=0,
            success_rate=None,
            avg_latency_ms=None,
            last_activity_at=None,
        )
        for agent_id in agent_ids
    }
    if not snapshots:
        return snapshots

    success_count = func.sum(case((AgentExecutionEvent.success.is_(True), 1), else_=0))
    statement = (
        select(
            AgentExecutionEvent.agent_id,
            func.count(AgentExecutionEvent.id).label("calls"),
            success_count.label("successful_calls"),
            func.avg(AgentExecutionEvent.latency_ms).label("avg_latency_ms"),
            func.max(AgentExecutionEvent.occurred_at).label("last_activity_at"),
        )
        .where(AgentExecutionEvent.agent_id.in_(snapshots))
        .group_by(AgentExecutionEvent.agent_id)
    )
    for row in db.execute(statement):
        calls = int(row.calls or 0)
        successful_calls = int(row.successful_calls or 0)
        snapshots[row.agent_id] = AgentMetricSnapshot(
            agent_id=row.agent_id,
            calls=calls,
            successful_calls=successful_calls,
            failed_calls=max(0, calls - successful_calls),
            success_rate=successful_calls / calls if calls else None,
            avg_latency_ms=float(row.avg_latency_ms) if row.avg_latency_ms is not None else None,
            last_activity_at=row.last_activity_at,
        )
    return snapshots
