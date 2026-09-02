"""Privacy-preserving client context used for transaction risk assessment."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base

if TYPE_CHECKING:
    pass


class TransactionRiskContext(Base):
    """Pseudonymous security context captured at login or transaction assessment.

    The database never stores the browser device identifier or IP address in
    plaintext. Location is intentionally rounded to two decimal places before
    persistence, which is sufficient for impossible-travel detection but not
    for precise tracking.
    """

    __tablename__ = "transaction_risk_contexts"
    __table_args__ = (
        CheckConstraint(
            "(geo_lat_e2 IS NULL AND geo_lon_e2 IS NULL) OR (geo_lat_e2 IS NOT NULL AND geo_lon_e2 IS NOT NULL)",
            name="ck_transaction_risk_contexts_geo_pair",
        ),
        CheckConstraint(
            "geo_lat_e2 IS NULL OR geo_lat_e2 BETWEEN -9000 AND 9000",
            name="ck_transaction_risk_contexts_geo_lat",
        ),
        CheckConstraint(
            "geo_lon_e2 IS NULL OR geo_lon_e2 BETWEEN -18000 AND 18000",
            name="ck_transaction_risk_contexts_geo_lon",
        ),
        CheckConstraint(
            "geo_accuracy_m IS NULL OR geo_accuracy_m BETWEEN 0 AND 100000",
            name="ck_transaction_risk_contexts_geo_accuracy",
        ),
        CheckConstraint(
            "event_type IN ('login', 'transaction_assessment')",
            name="ck_transaction_risk_contexts_event_type",
        ),
        Index("ix_transaction_risk_contexts_user_created", "user_id", "created_at"),
        Index(
            "ix_transaction_risk_contexts_user_event_created",
            "user_id",
            "event_type",
            "created_at",
        ),
        Index("ix_transaction_risk_contexts_transaction", "transaction_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(30), default="transaction_assessment", nullable=False)
    device_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    geo_lat_e2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geo_lon_e2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geo_accuracy_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
