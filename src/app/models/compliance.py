from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.user import User


class UserConsent(Base):
    __tablename__ = "user_consents"
    __table_args__ = (
        CheckConstraint(
            "consent_type IN ('terms_of_service', 'privacy_policy', 'fraud_analysis', 'model_improvement')",
            name="ck_user_consents_type",
        ),
        UniqueConstraint("user_id", "consent_type", "consent_version", name="uq_user_consent_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    consent_type: Mapped[str] = mapped_column(String(50), nullable=False)
    consent_version: Mapped[str] = mapped_column(String(30), nullable=False)
    is_granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    granted_at: Mapped[datetime] = mapped_column(server_default="now()", nullable=False)
    withdrawn_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)

    user: Mapped["User"] = relationship(back_populates="consents")


class DataRetentionPolicy(Base, TimestampMixin):
    __tablename__ = "data_retention_policies"
    __table_args__ = (
        CheckConstraint("retention_days > 0", name="ck_retention_days_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    data_category: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    anonymize_after_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
