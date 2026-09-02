from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.risk_assessment import TransactionRiskAssessment, TransactionWarning
    from src.app.models.timi_ledger_entry import TimiLedgerEntry
    from src.app.models.user import User


class TransactionStatus:
    DRAFT = "draft"
    RISK_CHECKING = "risk_checking"
    AWAITING_DECISION = "awaiting_decision"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TransactionEnvironment:
    SANDBOX = "sandbox"
    PRODUCTION = "production"


class Transaction(Base, TimestampMixin):
    """Lệnh chuyển tiền mô phỏng.

    Kết quả đánh giá không nằm trực tiếp ở đây. Mỗi lần chấm sẽ tạo một
    ``TransactionRiskAssessment`` riêng để bảo toàn lịch sử rule/model.
    """

    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint(
            "transaction_status IN ("
            "'draft', 'risk_checking', 'awaiting_decision', 'processing', "
            "'completed', 'failed', 'cancelled')",
            name="ck_transactions_status",
        ),
        CheckConstraint(
            "environment IN ('sandbox', 'production')",
            name="ck_transactions_environment",
        ),
        CheckConstraint("char_length(currency) = 3", name="ck_transactions_currency"),
        # Matches the transfer-page aggregate exactly, without indexing drafts
        # and cancelled transactions that can never count toward the limit.
        Index(
            "ix_transactions_user_completed_created",
            "user_id",
            "created_at",
            postgresql_where=text("transaction_status = 'completed'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    timi_recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    payee_account: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    payee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    transaction_status: Mapped[str] = mapped_column(
        String(30), default=TransactionStatus.DRAFT, nullable=False, index=True
    )
    environment: Mapped[str] = mapped_column(String(20), default=TransactionEnvironment.SANDBOX, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="VND", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="transactions", foreign_keys=[user_id])
    timi_recipient: Mapped[User | None] = relationship(
        back_populates="timi_received_transactions",
        foreign_keys=[timi_recipient_user_id],
    )
    timi_ledger_entries: Mapped[list[TimiLedgerEntry]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )
    assessments: Mapped[list[TransactionRiskAssessment]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )
    warnings: Mapped[list[TransactionWarning]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Transaction {self.amount} -> {self.payee_account} status={self.transaction_status}>"
