from src.app.services.risk_rules import RiskSignalCandidate, score_from_signals


def signal(signal_type: str, score: float, severity: str = "medium") -> RiskSignalCandidate:
    return RiskSignalCandidate(signal_type, severity, score, "evidence")


def test_one_weak_signal_cannot_be_high():
    score, level = score_from_signals(
        [
            signal("scam_pattern_match", 0.40, "high"),
            signal("new_payee", 0.20, "low"),
        ]
    )
    assert score == 0.59
    assert level == "medium"


def test_two_independent_strong_signals_can_be_high():
    score, level = score_from_signals(
        [
            signal("scam_pattern_match", 0.40, "high"),
            signal("suspicious_note", 0.25, "medium"),
        ]
    )
    assert score == 0.65
    assert level == "high"


def test_trusted_recipient_reduces_false_positive_score():
    score, level = score_from_signals(
        [
            signal("trusted_recipient", -0.25, "info"),
            signal("unusual_amount", 0.20, "medium"),
        ]
    )
    assert score == 0.0
    assert level == "safe"


def test_exact_blacklist_remains_high():
    score, level = score_from_signals(
        [
            signal("blacklist_exact_match", 0.95, "high"),
        ]
    )
    assert score == 0.95
    assert level == "high"
