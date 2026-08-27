from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.app.models.transaction_risk_context import TransactionRiskContext
from src.app.schemas.risk import AssessRequest, RiskClientContextIn
from src.app.services.risk_rules import (
    _behavioral_amount_signal,
    _note_signals,
    _telemetry_signals,
    _transaction_velocity_signal,
    score_from_signals,
)
from src.app.services.transaction_telemetry import RiskTelemetry, build_risk_telemetry


class _ScalarRows:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class _FakeDb:
    def __init__(self, *, scalar_values=None, execute_values=None):
        self.scalar_values = scalar_values or []
        self.execute_values = execute_values or []

    def scalars(self, _statement):
        return _ScalarRows(self.scalar_values)

    def execute(self, _statement):
        return _ScalarRows(self.execute_values)


def _request(*, amount: int = 50_000_000, note: str | None = None) -> AssessRequest:
    return AssessRequest(
        payee_account="0900000001",
        bank_code="TIMI",
        recipient_lookup_token="test-lookup-token",
        amount=amount,
        note=note,
    )


def test_behavioral_amount_anomaly_compares_completed_history():
    signal = _behavioral_amount_signal(
        _FakeDb(scalar_values=[500_000, 500_000, 550_000, 450_000]),
        uuid4(),
        _request(),
    )
    assert signal is not None
    assert signal.signal_type == "behavioral_amount_anomaly"
    assert signal.severity == "high"
    assert signal.evidence["median_amount_vnd"] == 500_000
    score, level = score_from_signals([
        signal,
        SimpleNamespace(signal_type="new_payee", score=0.20, severity="low"),
    ])
    assert score == 0.65
    assert level == "high"


def test_velocity_signal_requires_many_distinct_completed_recipients():
    previous = [(f"09{i:08d}", "TIMI") for i in range(2, 11)]
    signal = _transaction_velocity_signal(
        _FakeDb(execute_values=previous), uuid4(), _request(amount=500_000)
    )
    assert signal is not None
    assert signal.signal_type == "transaction_velocity"
    score, level = score_from_signals([signal])
    assert score == 0.65
    assert level == "high"


def test_requested_scam_keywords_are_accent_insensitive_and_explained():
    signals = _note_signals(
        "Cong an bao tai khoan vi pham, hay gui ma OTP de hoan tien qua buu dien"
    )
    keyword_signal = next(signal for signal in signals if signal.signal_type == "scam_keyword")
    assert keyword_signal.evidence["matched_categories"] == [
        "bưu điện",
        "công an",
        "hoàn tiền",
        "mã OTP",
        "tài khoản vi phạm",
    ]


def test_reward_claim_note_is_a_cautious_explainable_signal() -> None:
    signals = _note_signals("Nhan thuong ve may bay sang My")

    reward_signal = next(signal for signal in signals if signal.signal_type == "reward_claim_note")
    assert reward_signal.severity == "medium"
    assert reward_signal.score == 0.25
    assert "chuyển phí" in reward_signal.explanation


def test_impossible_travel_is_detected_from_opted_in_coarse_locations():
    now = datetime.now(UTC)
    previous = TransactionRiskContext(
        user_id=uuid4(),
        transaction_id=uuid4(),
        device_hash="old-device",
        ip_hash="old-network",
        geo_lat_e2=2103,  # Hanoi, rounded to E2
        geo_lon_e2=10585,
        geo_accuracy_m=100,
        created_at=now - timedelta(minutes=10),
    )
    telemetry = RiskTelemetry(
        device_hash="new-device",
        ip_hash="new-network",
        geo_lat_e2=1162,  # Cambodia, rounded to E2
        geo_lon_e2=10492,
        geo_accuracy_m=100,
        observed_at=now,
    )
    signals = _telemetry_signals(_FakeDb(scalar_values=[previous]), uuid4(), telemetry)
    assert {signal.signal_type for signal in signals} >= {
        "new_device",
        "new_network",
        "impossible_travel",
    }
    score, level = score_from_signals(signals)
    assert score == 0.85
    assert level == "high"


def test_telemetry_is_pseudonymized_and_location_requires_a_pair():
    raw_device = "d4d33a67-7cfe-4bb8-bae5-7cc2ec3e2abf"
    telemetry = build_risk_telemetry(
        RiskClientContextIn(device_id=raw_device), client_ip="203.0.113.10"
    )
    assert telemetry.device_hash != raw_device
    assert telemetry.ip_hash != "203.0.113.10"
    with pytest.raises(ValidationError):
        RiskClientContextIn(geo_latitude=21.03)
