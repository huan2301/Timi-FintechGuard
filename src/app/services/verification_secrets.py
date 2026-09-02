"""Keyed digests for short-lived email verification codes."""

from __future__ import annotations

import hashlib
import hmac

from src.app.config import get_settings


def hash_verification_code(code: str) -> str:
    """Prevent an offline six-digit brute-force if the database is exposed."""
    return hmac.new(
        get_settings().jwt_secret_key.encode("utf-8"),
        code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verification_code_matches(code: str, stored_digest: str) -> bool:
    current = hash_verification_code(code)
    if hmac.compare_digest(current, stored_digest):
        return True
    # Accept challenges issued immediately before this hardening release. They
    # expire in ten minutes, so the compatibility path disappears naturally.
    legacy = hashlib.sha256(code.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy, stored_digest)
