import json
from types import SimpleNamespace

import pytest

from src.app.config import get_settings
from src.app.services import scam_guardian_agent
from src.app.services.scam_guardian import GuardianConversationState


def _fake_response(payload: dict) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=json.dumps(payload))
            )
        ]
    )


def test_direct_evidence_guardrail_stabilizes_otp_request(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_agent_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class FakeCompletions:
        def create(self, **kwargs):
            assert kwargs["model"] == settings.guardian_agent_model
            assert kwargs["response_format"] == {"type": "json_object"}
            assert "latest_transcript" in kwargs["messages"][1]["content"]
            return _fake_response(
                {
                    "risk_score": 73,
                    "risk_level": "high",
                    "scenario": "otp_phishing",
                    "recommended_action": "PAUSE",
                    "explanation": "Caller yêu cầu OTP và gây áp lực thời gian.",
                    "signals": [
                        {
                            "signal_type": "otp_request",
                            "weight": 82,
                            "confidence": 0.97,
                            "evidence": "đọc mã OTP",
                        }
                    ],
                }
            )

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(scam_guardian_agent, "OpenAI", FakeOpenAI)
    state = GuardianConversationState()
    state.append("speaker_b", "Hãy đọc mã OTP.")

    result = scam_guardian_agent.analyze_with_guardian_agent(state, "Hãy đọc mã OTP.")

    # The model can propose a score, but an explicit request to read an OTP
    # is promoted to the stable PAUSE guardrail outcome.
    assert result.risk_score == 60
    assert result.risk_level == "high"
    assert result.recommended_action == "PAUSE"
    assert result.signals[0].signal_type == "otp_request"


def test_model_only_mode_preserves_model_decision_for_evaluation(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_agent_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    create=lambda **_kwargs: _fake_response(
                        {
                            "risk_score": 52,
                            "risk_level": "high",
                            "scenario": "credential_request",
                            "recommended_action": "PAUSE",
                            "explanation": "Cần tự xác minh trước khi tiếp tục.",
                            "signals": [],
                        }
                    )
                )
            )

    monkeypatch.setattr(scam_guardian_agent, "OpenAI", FakeOpenAI)
    state = GuardianConversationState()
    state.append("unknown", "Hãy đọc mã OTP để xác minh.")

    result = scam_guardian_agent.analyze_with_guardian_agent(
        state,
        "Hãy đọc mã OTP để xác minh.",
        apply_direct_guardrail=False,
    )

    assert result.risk_score == 52
    assert result.recommended_action == "PAUSE"


def test_immediate_policy_catches_unknown_server_stt_without_a_model_call() -> None:
    state = GuardianConversationState()
    state.append("unknown", "Hãy đọc mã OTP để xác minh tài khoản.")

    result = scam_guardian_agent.immediate_direct_evidence_result(state)

    assert result is not None
    assert result.recommended_action == "STOP"
    assert result.risk_level == "critical"
    assert result.signals[0].signal_type == "otp_request"


def test_invalid_agent_json_fails_closed(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_agent_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    create=lambda **_kwargs: SimpleNamespace(
                        choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))]
                    )
                )
            )

    monkeypatch.setattr(scam_guardian_agent, "OpenAI", FakeOpenAI)
    with pytest.raises(scam_guardian_agent.GuardianAgentUnavailableError):
        scam_guardian_agent.analyze_with_guardian_agent(
            GuardianConversationState(), "nội dung"
        )

    fallback = scam_guardian_agent.fail_closed_guardian_result("test")
    assert fallback.recommended_action == "STOP"
    assert fallback.scenario == "agent_unavailable"
    degraded = scam_guardian_agent.degraded_guardian_result("temporary")
    assert degraded.recommended_action == "PAUSE"
    assert degraded.risk_level == "high"


def test_agent_shape_aliases_are_normalized(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_agent_enabled", True)
    monkeypatch.setattr(settings, "groq_api_key", "test-key")

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(
                    create=lambda **_kwargs: SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                message=SimpleNamespace(
                                    content=(
                                        "```json\n"
                                        '{"score": 0.86, "level": "severe", '
                                        '"action": "block", "reason": "Dừng ngay", '
                                        '"detected_signals": ["otp_request"]}\n```'
                                    )
                                )
                            )
                        ]
                    )
                )
            )

    monkeypatch.setattr(scam_guardian_agent, "OpenAI", FakeOpenAI)
    result = scam_guardian_agent.analyze_with_guardian_agent(
        GuardianConversationState(), "Đọc mã OTP"
    )

    assert result.risk_score == 86
    assert result.risk_level == "critical"
    assert result.recommended_action == "STOP"
    assert result.signals[0].signal_type == "otp_request"


def test_rate_limit_message_produces_provider_backoff() -> None:
    error = RuntimeError(
        "Rate limit reached. Please try again in 4m52.464s."
    )
    error.status_code = 429  # type: ignore[attr-defined]
    assert scam_guardian_agent._retry_after_seconds(error) == pytest.approx(292.464)


def test_guardian_uses_a_backup_key_after_rate_limit(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "guardian_agent_enabled", True)
    monkeypatch.setattr(settings, "guardian_agent_api_key", "primary-key")
    monkeypatch.setattr(settings, "guardian_agent_api_keys", "backup-key")

    calls: list[str] = []

    class RateLimitError(RuntimeError):
        status_code = 429

    class FakeCompletions:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def create(self, **_kwargs):
            calls.append(self.api_key)
            if self.api_key == "primary-key":
                raise RateLimitError("rate limit")
            return _fake_response(
                {
                    "risk_score": 0,
                    "risk_level": "safe",
                    "scenario": None,
                    "recommended_action": "CONTINUE",
                    "explanation": "Không có dấu hiệu rủi ro.",
                    "signals": [],
                }
            )

    class FakeOpenAI:
        def __init__(self, *, api_key: str, **_kwargs) -> None:
            self.chat = SimpleNamespace(completions=FakeCompletions(api_key))

    monkeypatch.setattr(scam_guardian_agent, "OpenAI", FakeOpenAI)

    result = scam_guardian_agent.analyze_with_guardian_agent(
        GuardianConversationState(), "Cuộc gọi thông thường"
    )

    assert calls == ["primary-key", "backup-key"]
    assert result.recommended_action == "CONTINUE"
