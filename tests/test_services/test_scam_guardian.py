from src.app.services.scam_guardian import (
    GuardianConversationState,
    analyze_guardian_state,
)


def test_isolated_bank_word_is_not_a_scam_signal() -> None:
    state = GuardianConversationState()
    state.append("speaker_b", "Tôi muốn hỏi giờ làm việc của ngân hàng.")

    result = analyze_guardian_state(state)

    assert result.risk_score == 0
    assert result.risk_level == "safe"
    assert result.scenario is None


def test_authority_threat_secrecy_and_safe_account_reaches_critical() -> None:
    state = GuardianConversationState()
    state.append("speaker_b", "Tôi là cán bộ công an.")
    state.append("speaker_b", "Tài khoản của anh liên quan đến vụ án rửa tiền.")
    state.append("speaker_b", "Không được nói với ai, hãy chuyển tiền vào tài khoản an toàn.")

    result = analyze_guardian_state(state)
    signal_types = {signal.signal_type for signal in result.signals}

    assert result.risk_score >= 80
    assert result.risk_level == "critical"
    assert result.recommended_action == "STOP"
    assert result.scenario == "safe_account_scam"
    assert {"authority_impersonation", "legal_threat", "secrecy_request"} <= signal_types
    assert "safe_account_scam" in signal_types


def test_otp_and_remote_access_are_high_risk() -> None:
    state = GuardianConversationState()
    state.append("speaker_b", "Đọc mã OTP và cài AnyDesk để tôi hỗ trợ.")

    result = analyze_guardian_state(state)
    signal_types = {signal.signal_type for signal in result.signals}

    assert result.risk_level in {"high", "critical"}
    assert result.recommended_action in {"PAUSE", "STOP"}
    assert {"otp_request", "remote_access_request"} <= signal_types


def test_requested_social_engineering_signals_raise_risk() -> None:
    state = GuardianConversationState()
    state.append(
        "speaker_b",
        "Tôi là nhân viên ngân hàng. Tài khoản của anh sẽ bị khóa ngay lập tức. "
        "Hãy làm ngay trong 5 phút, đọc mã OTP và cung cấp mật khẩu. "
        "Không được gọi ngân hàng để xác minh.",
    )

    result = analyze_guardian_state(state)
    signal_types = {signal.signal_type for signal in result.signals}

    assert {
        "bank_impersonation",
        "urgency",
        "account_lock_threat",
        "otp_request",
        "credential_social_engineering",
        "prevent_external_verification",
        "authority_claim",
    } <= signal_types
    assert result.risk_score == 100
    assert result.risk_level == "critical"
    assert result.recommended_action == "STOP"
    assert result.scenario == "bank_impersonation"


def test_normal_bank_support_does_not_trigger_impersonation_signals() -> None:
    state = GuardianConversationState()
    state.append("speaker_b", "Tôi muốn hỏi ngân hàng mở cửa đến mấy giờ.")

    result = analyze_guardian_state(state)
    signal_types = {signal.signal_type for signal in result.signals}

    assert "bank_impersonation" not in signal_types
    assert "authority_claim" not in signal_types
    assert result.risk_score == 0
