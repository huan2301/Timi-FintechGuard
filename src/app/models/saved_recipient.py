"""A user's personal recipient address book.

Saved recipients are intentionally separate from ``TrustedRecipient``.  A
saved address is only a convenience for filling the transfer form; it must not
reduce the risk score or bypass a fresh recipient lookup.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.user import User


class SavedRecipient(Base, TimestampMixin):
    __tablename__ = "saved_recipients"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "account_number",
            "bank_code",
            name="uq_saved_recipient_per_user",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str] = mapped_column(String(64), nullable=False)
    bank_code: Mapped[str] = mapped_column(String(32), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(nullable=False)

    user: Mapped["User"] = relationship(back_populates="saved_recipients")
