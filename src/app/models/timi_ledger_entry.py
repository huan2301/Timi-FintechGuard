"""Immutable double-entry records for transfers inside Timi Bank."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base

if TYPE_CHECKING:
    from src.app.models.transaction import Transaction
    from src.app.models.user import User


class TimiLedgerEntryType:
    DEBIT = "debit"
    CREDIT = "credit"


class TimiLedgerEntry(Base):
    """One side of an internal transfer. Entries are never edited or deleted."""

    __tablename__ = "timi_ledger_entries"
    __table_args__ = (
        CheckConstraint("entry_type IN ('debit', 'credit')", name="ck_timi_ledger_entry_type"),
        CheckConstraint("amount > 0", name="ck_timi_ledger_amount_positive"),
        CheckConstraint("balance_after >= 0", name="ck_timi_ledger_balance_nonnegative"),
        UniqueConstraint("transaction_id", "entry_type", name="uq_timi_ledger_transaction_side"),
        Index("ix_timi_ledger_entries_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    entry_type: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    transaction: Mapped[Transaction] = relationship(back_populates="timi_ledger_entries")
    user: Mapped[User] = relationship(back_populates="timi_ledger_entries")
