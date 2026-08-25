"""Server-owned rules for choosing PIN versus Face ID on a transfer."""

from __future__ import annotations


FACE_VERIFICATION_AMOUNT_THRESHOLD = 10_000_000


def requires_face_verification(
    *,
    amount: int,
    risk_level: str | None = None,
    blacklist_match_found: bool = False,
) -> bool:
    """Face ID is the sole completion method for high-value transfers.

    Exact blacklist matches retain the stricter existing policy even below the
    monetary threshold. Every transfer at or above the threshold requires Face
    ID regardless of its calculated risk level.
    """
    return amount >= FACE_VERIFICATION_AMOUNT_THRESHOLD or (
        risk_level == "high" and blacklist_match_found
    )
