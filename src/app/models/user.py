import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.compliance import UserConsent
    from src.app.models.risk_assessment import WarningFeedback
    from src.app.models.scam_report import ScamReport
    from src.app.models.timi_ledger_entry import TimiLedgerEntry
    from src.app.models.transaction import Transaction
    from src.app.models.trusted_recipient import TrustedRecipient


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        CheckConstraint("balance >= 0", name="ck_users_balance_nonnegative"),
        CheckConstraint(
            "NOT timi_bank_enabled OR (phone IS NOT NULL AND phone ~ '^[0-9]{10}$')",
            name="ck_users_timi_bank_phone_format",
        ),
        Index(
            "uq_users_timi_bank_phone",
            "phone",
            unique=True,
            postgresql_where=text("timi_bank_enabled AND phone IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Google's immutable `sub` claim is the OAuth account identifier. Never use
    # the email address as the federated identity key because it can change.
    google_subject: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    transaction_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.USER.value, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    balance: Mapped[int] = mapped_column(BigInteger, default=50_000_000, nullable=False)
    timi_bank_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    @property
    def is_google_account(self) -> bool:
        """Whether this account is backed by Google OAuth."""
        return bool(self.google_subject)

    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="user", foreign_keys="Transaction.user_id"
    )
    timi_received_transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="timi_recipient",
        foreign_keys="Transaction.timi_recipient_user_id",
    )
    timi_ledger_entries: Mapped[list["TimiLedgerEntry"]] = relationship(
        back_populates="user"
    )
    trusted_recipients: Mapped[list["TrustedRecipient"]] = relationship(back_populates="user")
    consents: Mapped[list["UserConsent"]] = relationship(back_populates="user")
    warning_feedback: Mapped[list["WarningFeedback"]] = relationship(
        back_populates="user", foreign_keys="WarningFeedback.user_id"
    )
    scam_reports: Mapped[list["ScamReport"]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.email} role={self.role}>"
