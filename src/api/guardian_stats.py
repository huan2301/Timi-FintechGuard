"""Phase 1 – Observability endpoint for Guardian decisions.

Mount in main.py:
  from src.api import guardian_stats
  app.include_router(guardian_stats.router, prefix="/api/v1")

In-memory ring buffer for demo; replace with DB aggregation in production.
"""

from __future__ import annotations

import threading
import time
from collections import Counter, deque
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

# Optional: protect with admin dependency if available
try:
    from src.app.core.deps import require_admin
except ImportError:  # pragma: no cover

    def require_admin() -> None:  # type: ignore
        return None


router = APIRouter(prefix="/guardian", tags=["guardian-stats"])

_lock = threading.Lock()
_MAX = 2000
_events: deque[dict[str, Any]] = deque(maxlen=_MAX)


class GuardianStatEvent(BaseModel):
    action: Literal["CONTINUE", "MONITOR", "PAUSE", "STOP"]
    risk_level: str = "safe"
    risk_score: int = Field(ge=0, le=100, default=0)
    schema_ok: bool = True
    source: str = "agent"  # agent | rule | hybrid
    latency_ms: float | None = None
    session_id: str | None = None


def record_guardian_event(event: dict[str, Any]) -> None:
    """Call from WebSocket / analyze path after each decision."""
    row = {
        "ts": time.time(),
        "action": event.get("action", "CONTINUE"),
        "risk_level": event.get("risk_level", "safe"),
        "risk_score": int(event.get("risk_score") or 0),
        "schema_ok": bool(event.get("schema_ok", True)),
        "source": event.get("source", "agent"),
        "latency_ms": event.get("latency_ms"),
        "session_id": event.get("session_id"),
    }
    with _lock:
        _events.append(row)


@router.post("/stats/events", status_code=204)
def post_event(body: GuardianStatEvent) -> None:
    """Optional manual ingest (tests / external)."""
    record_guardian_event(body.model_dump())


@router.get("/stats/summary")
def summary(
    last_n: int = 500,
    _admin: None = Depends(require_admin),
) -> dict[str, Any]:
    with _lock:
        rows = list(_events)[-max(1, min(last_n, _MAX)) :]

    if not rows:
        return {
            "count": 0,
            "action_distribution": {},
            "schema_ok_rate": None,
            "avg_latency_ms": None,
            "source_distribution": {},
        }

    actions = Counter(r["action"] for r in rows)
    sources = Counter(r["source"] for r in rows)
    schema_ok = sum(1 for r in rows if r["schema_ok"])
    lats = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
    avg_lat = round(sum(lats) / len(lats), 1) if lats else None

    return {
        "count": len(rows),
        "action_distribution": dict(actions),
        "source_distribution": dict(sources),
        "schema_ok_rate": round(schema_ok / len(rows), 4),
        "avg_latency_ms": avg_lat,
        "avg_risk_score": round(sum(r["risk_score"] for r in rows) / len(rows), 1),
    }


@router.delete("/stats/events", status_code=204)
def clear_events(_admin: None = Depends(require_admin)) -> None:
    with _lock:
        _events.clear()
