from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.app.models.timi_ledger_entry import TimiLedgerEntryType
from src.app.models.user import UserRole
from src.app.schemas.auth import (
    LoginLocationRequest,
    LoginRequest,
    RegisterRequest,
)
from src.app.services.recipient_lookup import RecipientLookupInvalid, lookup_recipient
from src.app.services.timi_bank import (
    TIMI_BANK_CODE,
    InsufficientTimiBalance,
    TimiAdminRecipientError,
    TimiSelfTransfer,
    apply_timi_transfer,
    is_timi_bank,
    lock_timi_transfer_parties,
)

LOCATION_CONTEXT = {
    "device_id": "test-browser-device-0001",
    "geo_latitude": 10.7769,
    "geo_longitude": 106.7009,
    "geo_accuracy_m": 500,
}


class RecordingSession:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add_all(self, rows: list[object]) -> None:
        self.added.extend(rows)


class LockedUsersResult:
    def __init__(self, users: list[object]) -> None:
        self.users = users

    def all(self) -> list[object]:
        return self.users


class LockedUsersSession:
    def __init__(self, users: list[object]) -> None:
        self.users = users

    def scalars(self, _query: object) -> LockedUsersResult:
        return LockedUsersResult(self.users)


def test_timi_bank_code_is_unambiguous() -> None:
    assert is_timi_bank("TIMI")
    assert not is_timi_bank("TIMO")
    assert not is_timi_bank(None)


def test_registration_phone_must_have_exactly_ten_digits() -> None:
    payload = RegisterRequest(
        email="ten-digits@example.com",
        full_name="Ten Digits",
        password="Password-123!",
        phone="0912345678",
    )
    assert payload.phone == "0912345678"

    with pytest.raises(ValueError):
        RegisterRequest(
            email="nine-digits@example.com",
            full_name="Nine Digits",
            password="Password-123!",
            phone="912345678",
        )


def test_location_is_required_on_the_post_login_setup_screen() -> None:
    credentials = LoginRequest(
        email="location-flow@example.com",
        password="Password-123!",
    )
    assert credentials.email == "location-flow@example.com"

    with pytest.raises(ValueError, match="client_context"):
        LoginLocationRequest()
    location_request = LoginLocationRequest(
        client_context=LOCATION_CONTEXT,
    )
    assert location_request.client_context.geo_latitude == 10.7769


def test_internal_transfer_creates_balanced_debit_and_credit_entries() -> None:
    sender = SimpleNamespace(id=uuid4(), balance=500_000)
    recipient = SimpleNamespace(id=uuid4(), balance=125_000)
    transaction = SimpleNamespace(
        id=uuid4(), amount=200_000, timi_recipient_user_id=None
    )
    db = RecordingSession()

    apply_timi_transfer(
        db, transaction=transaction, sender=sender, recipient=recipient
    )

    assert sender.balance == 300_000
    assert recipient.balance == 325_000
    assert transaction.timi_recipient_user_id == recipient.id
    assert len(db.added) == 2
    debit, credit = db.added
    assert debit.entry_type == TimiLedgerEntryType.DEBIT
    assert debit.user_id == sender.id
    assert debit.amount == 200_000
    assert debit.balance_after == 300_000
    assert credit.entry_type == TimiLedgerEntryType.CREDIT
    assert credit.user_id == recipient.id
    assert credit.amount == 200_000
    assert credit.balance_after == 325_000


def test_insufficient_balance_never_changes_either_account() -> None:
    sender = SimpleNamespace(id=uuid4(), balance=199_999)
    recipient = SimpleNamespace(id=uuid4(), balance=125_000)
    transaction = SimpleNamespace(
        id=uuid4(), amount=200_000, timi_recipient_user_id=None
    )
    db = RecordingSession()

    with pytest.raises(InsufficientTimiBalance):
        apply_timi_transfer(
            db, transaction=transaction, sender=sender, recipient=recipient
        )

    assert sender.balance == 199_999
    assert recipient.balance == 125_000
    assert transaction.timi_recipient_user_id is None
    assert db.added == []


def test_self_transfer_is_rejected_before_any_balance_change() -> None:
    account = SimpleNamespace(id=uuid4(), balance=500_000)
    transaction = SimpleNamespace(
        id=uuid4(), amount=200_000, timi_recipient_user_id=None
    )
    db = RecordingSession()

    with pytest.raises(TimiSelfTransfer):
        apply_timi_transfer(
            db, transaction=transaction, sender=account, recipient=account
        )

    assert account.balance == 500_000
    assert db.added == []


def test_admin_timi_account_cannot_receive_transfers() -> None:
    sender = SimpleNamespace(
        id=uuid4(),
        phone="0900000001",
        timi_bank_enabled=True,
        is_active=True,
        role=UserRole.USER.value,
    )
    admin = SimpleNamespace(
        id=uuid4(),
        phone="0900000002",
        timi_bank_enabled=True,
        is_active=True,
        role=UserRole.ADMIN.value,
    )

    with pytest.raises(TimiAdminRecipientError, match="quản trị viên"):
        lock_timi_transfer_parties(
            LockedUsersSession([sender, admin]),
            sender_user_id=sender.id,
            recipient_account_number=admin.phone,
        )


def test_admin_timi_account_cannot_be_resolved_as_a_recipient(monkeypatch: pytest.MonkeyPatch) -> None:
    admin = SimpleNamespace(
        id=uuid4(),
        full_name="Admin",
        role=UserRole.ADMIN.value,
    )
    monkeypatch.setattr(
        "src.app.services.recipient_lookup.find_active_timi_recipient",
        lambda _db, _account_number: admin,
    )

    with pytest.raises(RecipientLookupInvalid, match="quản trị viên"):
        lookup_recipient(
            object(),
            user_id=uuid4(),
            account_number="0900000002",
            bank_code=TIMI_BANK_CODE,
        )


def test_recipient_lookup_marks_an_exact_blacklist_match_as_caution(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recipient = SimpleNamespace(
        id=uuid4(),
        full_name="Nguyen Viet Quang",
        role=UserRole.USER.value,
    )
    monkeypatch.setattr(
        "src.app.services.recipient_lookup.find_active_timi_recipient",
        lambda _db, _account_number: recipient,
    )
    monkeypatch.setattr(
        "src.app.services.recipient_lookup._active_account_blacklist_entry",
        lambda _db, **_kwargs: SimpleNamespace(),
    )

    result = lookup_recipient(
        object(),
        user_id=uuid4(),
        account_number="0900000003",
        bank_code=TIMI_BANK_CODE,
    )

    assert result.account_name == "Nguyen Viet Quang"
    assert result.needs_caution is True
