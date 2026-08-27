from datetime import UTC, datetime
from types import SimpleNamespace

from src.app.services import agent_metrics


def test_record_agent_call_persists_a_payload_free_execution_event(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeSession:
        def add(self, event: object) -> None:
            captured["event"] = event

        def commit(self) -> None:
            captured["committed"] = True

        def rollback(self) -> None:
            captured["rolled_back"] = True

        def close(self) -> None:
            captured["closed"] = True

    monkeypatch.setattr(agent_metrics, "SessionLocal", FakeSession)

    agent_metrics.record_agent_call(
        "chat_support",
        latency_ms=12.6,
        success=False,
        operation="ChatSupportTask",
        failure_type="TimeoutError",
    )

    event = captured["event"]
    assert event.agent_id == "chat_support"
    assert event.operation == "ChatSupportTask"
    assert event.success is False
    assert event.latency_ms == 13
    assert event.failure_type == "TimeoutError"
    assert captured["committed"] is True
    assert captured["closed"] is True


def test_get_persisted_metrics_aggregates_neon_execution_rows() -> None:
    last_activity = datetime(2026, 8, 27, 9, 0, tzinfo=UTC)

    class FakeSession:
        def execute(self, _statement: object):
            return [
                SimpleNamespace(
                    agent_id="chat_support",
                    calls=5,
                    successful_calls=4,
                    avg_latency_ms=28.4,
                    last_activity_at=last_activity,
                )
            ]

    metrics = agent_metrics.get_persisted_metrics(
        FakeSession(),  # type: ignore[arg-type]
        ["chat_support", "call_guardian"],
    )

    assert metrics["chat_support"].calls == 5
    assert metrics["chat_support"].successful_calls == 4
    assert metrics["chat_support"].failed_calls == 1
    assert metrics["chat_support"].success_rate == 0.8
    assert metrics["chat_support"].avg_latency_ms == 28.4
    assert metrics["chat_support"].last_activity_at == last_activity
    assert metrics["call_guardian"].calls == 0
    assert metrics["call_guardian"].last_activity_at is None
