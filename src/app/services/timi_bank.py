"""Account identity and atomic balance movements for the demo Timi Bank."""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.app.models.timi_ledger_entry import TimiLedgerEntry, TimiLedgerEntryType
from src.app.models.transaction import Transaction
from src.app.models.user import User, UserRole

TIMI_BANK_CODE = "TIMI"
TIMI_BANK_NAME = "Timi Bank"


class TimiTransferError(Exception):
    """A domain error that must stop an internal money movement."""


class TimiRecipientUnavailable(TimiTransferError):  # noqa: N818 - public domain exception name
    pass


class TimiSelfTransfer(TimiTransferError):  # noqa: N818 - public domain exception name
    pass


class TimiAdminRecipientError(TimiTransferError):
    pass


class InsufficientTimiBalance(TimiTransferError):  # noqa: N818 - public domain exception name
    pass


def is_timi_bank(bank_code: str | None) -> bool:
    return bank_code == TIMI_BANK_CODE


def find_active_timi_recipient(db: Session, account_number: str) -> User | None:
    return db.scalar(
        select(User).where(
            User.phone == account_number,
            User.is_active.is_(True),
            User.timi_bank_enabled.is_(True),
        )
    )


def lock_timi_transfer_parties(
    db: Session, *, sender_user_id: uuid.UUID, recipient_account_number: str
) -> tuple[User, User]:
    """Lock both accounts in UUID order to prevent lost updates and deadlocks."""
    users = db.scalars(
        select(User)
        .where(
            or_(
                User.id == sender_user_id,
                User.phone == recipient_account_number,
            )
        )
        .order_by(User.id)
        .with_for_update()
    ).all()
    sender = next((user for user in users if user.id == sender_user_id), None)
    recipient = next(
        (user for user in users if user.phone == recipient_account_number),
        None,
    )
    if sender is None or not sender.timi_bank_enabled:
        raise TimiTransferError("Tài khoản Timi của người gửi chưa sẵn sàng.")
    if recipient is None or not recipient.is_active:
        raise TimiRecipientUnavailable("Tài khoản Timi người nhận không còn hoạt động.")
    if recipient.role == UserRole.ADMIN.value:
        raise TimiAdminRecipientError("Không thể chuyển tiền đến tài khoản quản trị viên.")
    if sender.id == recipient.id:
        raise TimiSelfTransfer("Không thể chuyển tiền vào chính tài khoản Timi của bạn.")
    return sender, recipient


def apply_timi_transfer(
    db: Session,
    *,
    transaction: Transaction,
    sender: User,
    recipient: User,
) -> None:
    """Apply both ledger sides in the caller's single database transaction.

    The caller must have acquired the transaction and both user row locks. No
    commit happens here: a failure while creating either ledger row rolls back
    the debit, credit, transaction status, and audit record together.
    """
    if transaction.amount <= 0:
        raise TimiTransferError("Số tiền chuyển phải lớn hơn 0.")
    if sender.id == recipient.id:
        raise TimiSelfTransfer("Không thể chuyển tiền vào chính tài khoản Timi của bạn.")
    if sender.balance < transaction.amount:
        raise InsufficientTimiBalance("Số dư không đủ.")

    sender.balance -= transaction.amount
    recipient.balance += transaction.amount
    transaction.timi_recipient_user_id = recipient.id
    db.add_all(
        [
            TimiLedgerEntry(
                transaction_id=transaction.id,
                user_id=sender.id,
                entry_type=TimiLedgerEntryType.DEBIT,
                amount=transaction.amount,
                balance_after=sender.balance,
            ),
            TimiLedgerEntry(
                transaction_id=transaction.id,
                user_id=recipient.id,
                entry_type=TimiLedgerEntryType.CREDIT,
                amount=transaction.amount,
                balance_after=recipient.balance,
            ),
        ]
    )
