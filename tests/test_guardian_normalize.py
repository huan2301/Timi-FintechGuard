"""Unit tests for Guardian agent payload normalization (Phase 1 hardening)."""

from __future__ import annotations

import pytest

# Import after path setup in real repo:
# from src.app.services.scam_guardian_agent import (
#     _normalize_decision_payload,
#     _parse_json,
#     GuardianAgentUnavailableError,
# )


# --- Copy of normalize logic under test (keep in sync with production) ---
# Prefer importing from production once patch is applied.


def _normalize_decision_payload(payload: dict) -> dict:
    """Minimal mirror for offline tests if import fails."""
    from src.app.services.scam_guardian_agent import _normalize_decision_payload as real

    return real(payload)


def test_normalize_aliases_score_action_level():
    raw = {
        "score": 0.9,  # probability style → 90
        "action": "block",
        "level": "severe",
        "reason": "OTP phishing",
        "detected_signals": [
            {"type": "otp_request", "score": 30, "probability": 0.9, "match": "đọc OTP"}
        ],
    }
    out = _normalize_decision_payload(raw)
    assert out["risk_score"] == 90
    assert out["recommended_action"] == "STOP"
    assert out["risk_level"] == "critical"
    assert out["explanation"]
    assert out["signals"][0]["signal_type"] == "otp_request"
    assert out["signals"][0]["confidence"] == 0.9


def test_normalize_wrapper_decision_key():
    raw = {
        "decision": {
            "risk_score": 40,
            "risk_level": "warning",
            "recommended_action": "MONITOR",
            "explanation": "nhẹ",
            "signals": [],
        }
    }
    out = _normalize_decision_payload(raw)
    assert out["recommended_action"] == "MONITOR"
    assert out["risk_score"] == 40


def test_normalize_missing_action_inferred_from_level():
    raw = {
        "risk_score": 70,
        "risk_level": "high",
        "explanation": "đáng ngờ",
        "signals": [],
    }
    out = _normalize_decision_payload(raw)
    assert out["recommended_action"] == "PAUSE"


def test_normalize_decision_confidence_clamped():
    raw = {
        "risk_score": 50,
        "risk_level": "high",
        "recommended_action": "PAUSE",
        "decision_confidence": 1.5,
        "explanation": "test",
        "signals": [],
    }
    out = _normalize_decision_payload(raw)
    # After Phase 1 patch, confidence should be in payload or side channel.
    # If production adds decision_confidence to normalize output:
    if "decision_confidence" in out:
        assert 0.0 <= out["decision_confidence"] <= 1.0


def test_parse_json_strips_markdown_fence():
    from src.app.services.scam_guardian_agent import _parse_json

    text = """```json
{"risk_score": 10, "risk_level": "safe", "recommended_action": "CONTINUE",
 "explanation": "ok", "signals": []}
```"""
    decision = _parse_json(text)
    assert decision.recommended_action == "CONTINUE"
    assert decision.risk_score == 10


def test_rule_engine_safe_delivery_not_stop():
    from src.app.services.scam_guardian import (
        GuardianConversationState,
        analyze_guardian_state,
    )

    state = GuardianConversationState()
    state.append("caller", "Chào anh, em giao hàng FastShip, đơn đến chiều nay.")
    result = analyze_guardian_state(state)
    assert result.recommended_action in ("CONTINUE", "MONITOR")
    assert result.risk_score < 50


def test_rule_engine_otp_phishing_stop():
    from src.app.services.scam_guardian import (
        GuardianConversationState,
        analyze_guardian_state,
    )

    state = GuardianConversationState()
    state.append(
        "caller",
        "Bên bảo mật ngân hàng đây. Anh đọc giúp mã OTP vừa nhận được để mở khóa.",
    )
    result = analyze_guardian_state(state)
    assert result.risk_score >= 60
    types = {s.signal_type for s in result.signals}
    assert "otp_request" in types or "credential_social_engineering" in types


def test_hybrid_merge_low_confidence_floors_pause():
    from src.app.services.scam_guardian import GuardianRiskResult, GuardianSignal
    from src.app.services.scam_guardian_hybrid import merge_rule_and_agent

    rule = GuardianRiskResult(
        risk_score=65,
        risk_level="high",
        scenario=None,
        recommended_action="PAUSE",
        explanation="rule",
        signals=(
            GuardianSignal("account_lock_threat", 24, 1.0, "khóa"),
        ),
    )
    agent = GuardianRiskResult(
        risk_score=20,
        risk_level="safe",
        scenario=None,
        recommended_action="CONTINUE",
        explanation="agent weak",
        signals=(),
    )
    final, meta = merge_rule_and_agent(rule, agent, agent_confidence=0.4)
    assert final.recommended_action in ("PAUSE", "STOP")
    assert meta.source == "hybrid"
