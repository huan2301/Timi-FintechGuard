"""Safe, short-lived context from a Scam Guardian alert for transfer checks."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.app.models.scam_guardian import ScamAlert, ScamGuardianSession

RECENT_GUARDIAN_ALERT_WINDOW = timedelta(hours=24)


@dataclass(frozen=True)
class RecentGuardianAlert:
    """Metadata only; never contains call transcript or raw signal evidence."""

    alert_id: uuid.UUID
    session_id: uuid.UUID
    alerted_at: datetime
    age_minutes: int
    risk_score: int
    action: str


def recent_guardian_alert_for_user(
    db: Session,
    *,
    user_id: uuid.UUID,
    now: datetime | None = None,
) -> RecentGuardianAlert | None:
    """Return the newest serious Guardian alert for this user in the last 24h.

    The alert timestamp, rather than the call start/end time, defines the
    window.  This ensures a transfer is only influenced after the user was
    actually warned.  The query deliberately returns metadata only, keeping
    non-consented transcript data out of the transaction and chat paths.
    """

    current_time = now or datetime.now(UTC)
    row = db.execute(
        select(ScamAlert, ScamGuardianSession)
        .join(ScamGuardianSession, ScamGuardianSession.id == ScamAlert.session_id)
        .where(
            ScamGuardianSession.user_id == user_id,
            ScamAlert.created_at >= current_time - RECENT_GUARDIAN_ALERT_WINDOW,
            ScamAlert.created_at <= current_time,
        )
        .order_by(desc(ScamAlert.created_at))
        .limit(1)
    ).first()
    if row is None:
        return None

    alert, session = row
    alerted_at = alert.created_at
    if alerted_at.tzinfo is None:
        # Legacy databases may expose a naive timestamp even though the value
        # was written by PostgreSQL's UTC-aware runtime. Treat it as UTC solely
        # for elapsed-time display and never send it back to the database.
        alerted_at = alerted_at.replace(tzinfo=UTC)
    age_minutes = max(0, int((current_time - alerted_at).total_seconds() // 60))
    return RecentGuardianAlert(
        alert_id=alert.id,
        session_id=session.id,
        alerted_at=alerted_at,
        age_minutes=age_minutes,
        risk_score=session.max_risk_score,
        action=session.agent_action,
    )


def guardian_alert_elapsed_label(age_minutes: int) -> str:
    """Render elapsed time in concise Vietnamese for user-facing copy."""

    safe_minutes = max(0, age_minutes)
    if safe_minutes < 1:
        return "vừa xảy ra"
    if safe_minutes < 60:
        return f"{safe_minutes} phút trước"
    hours = safe_minutes // 60
    if hours == 1:
        return "khoảng 1 giờ trước"
    return f"khoảng {hours} giờ trước"
