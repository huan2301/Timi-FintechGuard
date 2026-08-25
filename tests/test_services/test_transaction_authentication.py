from src.app.services.transaction_authentication import (
    FACE_VERIFICATION_AMOUNT_THRESHOLD,
    requires_face_verification,
)


def test_face_id_is_required_at_or_above_ten_million() -> None:
    assert not requires_face_verification(
        amount=FACE_VERIFICATION_AMOUNT_THRESHOLD - 1,
        risk_level="safe",
    )
    assert requires_face_verification(
        amount=FACE_VERIFICATION_AMOUNT_THRESHOLD,
        risk_level="safe",
    )
    assert requires_face_verification(
        amount=50_000_000,
        risk_level="low",
    )


def test_exact_blacklist_match_remains_face_id_only_below_threshold() -> None:
    assert requires_face_verification(
        amount=500_000,
        risk_level="high",
        blacklist_match_found=True,
    )
