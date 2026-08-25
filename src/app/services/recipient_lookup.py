"""Resolve account names from the project's PostgreSQL data only."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.models.blacklist import Blacklist
from src.app.models.recipient_directory import RecipientDirectory
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.models.user import UserRole
from src.app.services.bank_normalization import normalize_bank_name
from src.app.services.timi_bank import TIMI_BANK_CODE, find_active_timi_recipient


@dataclass(frozen=True)
class RecipientLookupResult:
    account_name: str
    source: str


class RecipientLookupNotFound(Exception):
    """Raised when no internal record contains the requested account name."""


class RecipientLookupInvalid(Exception):
    """Raised when an otherwise valid lookup is not a permitted transfer target."""


def _name_from_blacklist(entry: Blacklist) -> str | None:
    evidence = entry.evidence or {}
    for key in ("reported_name", "ten"):
        value = evidence.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def lookup_recipient(
    db: Session, *, user_id: object, account_number: str, bank_code: str
) -> RecipientLookupResult:
    """Find an exact account-plus-bank match without calling an external API."""
    if bank_code == TIMI_BANK_CODE:
        timi_user = find_active_timi_recipient(db, account_number)
        if timi_user is None:
            raise RecipientLookupNotFound
        if timi_user.role == UserRole.ADMIN.value:
            raise RecipientLookupInvalid("Không thể chuyển tiền đến tài khoản quản trị viên.")
        if str(timi_user.id) == str(user_id):
            raise RecipientLookupInvalid("Không thể chuyển tiền vào chính tài khoản Timi của bạn.")
        return RecipientLookupResult(timi_user.full_name, "timi")

    directory_entry = db.scalar(
        select(RecipientDirectory).where(
            RecipientDirectory.account_number == account_number,
            RecipientDirectory.bank_code == bank_code,
            RecipientDirectory.is_active.is_(True),
        )
    )
    if directory_entry is not None:
        return RecipientLookupResult(directory_entry.account_name, "directory")

    blacklist_entries = db.scalars(
        select(Blacklist).where(
            Blacklist.entity_type == "account",
            Blacklist.entity_value == account_number,
            Blacklist.is_active.is_(True),
        )
    ).all()
    for entry in blacklist_entries:
        if normalize_bank_name(entry.bank) != bank_code:
            continue
        account_name = _name_from_blacklist(entry)
        if account_name is not None:
            return RecipientLookupResult(account_name, "blacklist")

    trusted_recipient = db.scalar(
        select(TrustedRecipient).where(
            TrustedRecipient.user_id == user_id,
            TrustedRecipient.account_number == account_number,
            TrustedRecipient.bank_code == bank_code,
        )
    )
    if trusted_recipient is not None:
        return RecipientLookupResult(trusted_recipient.recipient_name, "trusted_recipient")

    raise RecipientLookupNotFound
