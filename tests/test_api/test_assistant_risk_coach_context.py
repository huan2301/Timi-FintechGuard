from types import SimpleNamespace
from uuid import uuid4

from src.app.routers.api.assistant import _risk_coach_context_from_persisted_data


def test_risk_coach_uses_persisted_transaction_evidence_not_browser_fields() -> None:
    transaction_id = uuid4()
    context = _risk_coach_context_from_persisted_data(
        SimpleNamespace(
            id=transaction_id,
            payee_name="Dat Ly",
            payee_account="01234567893445",
            bank_code="TIMI",
            amount=200_000,
            note="Nhận thưởng vé máy bay sang Mỹ",
        ),
        SimpleNamespace(risk_level="high", risk_score=0.98, explanation="Cần dừng để xác minh."),
        [
            SimpleNamespace(
                score=0.95,
                explanation="Tài khoản ***3445 đã được đánh dấu cần thận trọng.",
            ),
            SimpleNamespace(score=-0.25, explanation="Người nhận tin cậy."),
        ],
        SimpleNamespace(message="Khuyến nghị tạm dừng và xác minh độc lập."),
    )

    assert context.transaction_id == str(transaction_id)
    assert context.recipient_name == "Dat Ly"
    assert context.recipient_account_masked == "***3445"
    assert context.note == "Nhận thưởng vé máy bay sang Mỹ"
    assert context.risk_score == 0.98
    assert context.signals == ["Tài khoản ***3445 đã được đánh dấu cần thận trọng."]
