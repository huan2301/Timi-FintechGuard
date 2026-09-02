from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from src.app.routers.api.transactions import _response_from_assessment


def test_face_challenge_returned_by_assessment_is_persisted_value() -> None:
    nonce = uuid4().hex
    expires_at = datetime.now(UTC) + timedelta(minutes=3)
    transaction = SimpleNamespace(id=uuid4(), amount=10_000_000)
    assessment = SimpleNamespace(
        id=uuid4(),
        risk_score=0.2,
        risk_level="low",
        blacklist_match_found=False,
        raw_result={
            "face_verification_challenge": {
                "nonce": nonce,
                "expires_at": expires_at.isoformat(),
            }
        },
        explanation="Không phát hiện tín hiệu rủi ro cao.",
        should_warn=False,
    )

    response = _response_from_assessment(transaction, assessment, [], None)

    assert response.requires_face_verification is True
    assert response.face_verification_nonce == nonce
    assert response.face_verification_expires_at == expires_at
