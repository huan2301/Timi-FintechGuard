"""Internal directory of account names used for risk-data compatibility."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class RecipientDirectory(Base, TimestampMixin):
    """A global, internal account-number to account-name mapping.

    This is intentionally separate from blacklist records and user-specific
    trusted recipients. It is populated by the project team, not an external
    bank API.
    """

    __tablename__ = "recipient_directory"
    __table_args__ = (UniqueConstraint("account_number", "bank_code", name="uq_recipient_directory_account_bank"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_number: Mapped[str] = mapped_column(String(64), nullable=False)
    bank_code: Mapped[str] = mapped_column(String(32), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(100), default="internal", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
