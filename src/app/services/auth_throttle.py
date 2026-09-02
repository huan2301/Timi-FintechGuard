"""Database-backed lockouts for password and transaction-PIN verification."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

from src.app.models.user import User

CredentialScope = Literal["login", "pin"]


def _attributes(scope: CredentialScope) -> tuple[str, str]:
    if scope == "login":
        return "failed_login_attempts", "login_locked_until"
    return "failed_pin_attempts", "pin_locked_until"


def lock_remaining_seconds(user: User, scope: CredentialScope) -> int:
    _, locked_attribute = _attributes(scope)
    locked_until = getattr(user, locked_attribute)
    if locked_until is None:
        return 0
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    return max(0, int((locked_until - datetime.now(UTC)).total_seconds()))


def record_failure(
    user: User,
    scope: CredentialScope,
    *,
    failure_limit: int,
    lock_seconds: int,
) -> int:
    attempts_attribute, locked_attribute = _attributes(scope)
    attempts = int(getattr(user, attempts_attribute) or 0) + 1
    setattr(user, attempts_attribute, attempts)
    if attempts >= failure_limit:
        setattr(user, locked_attribute, datetime.now(UTC) + timedelta(seconds=lock_seconds))
        setattr(user, attempts_attribute, 0)
        return lock_seconds
    return 0


def clear_failures(user: User, scope: CredentialScope) -> None:
    attempts_attribute, locked_attribute = _attributes(scope)
    setattr(user, attempts_attribute, 0)
    setattr(user, locked_attribute, None)
