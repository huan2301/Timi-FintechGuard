import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, CheckConstraint, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.risk_assessment import RiskSignal


class Blacklist(Base, TimestampMixin):
    __tablename__ = "blacklist"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('account', 'phone', 'email', 'url')",
            name="ck_blacklist_entity_type",
        ),
        Index(
            "ix_blacklist_active_account_bank",
            "entity_value",
            "bank",
            postgresql_where="entity_type = 'account' AND is_active = true",
        ),
        # Supports newest-first keyset pages in the admin blacklist without an
        # offset scan as the imported blacklist grows.
        Index("ix_blacklist_created_at_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_value: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    bank: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(255), nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), default=0.95, nullable=False)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    matched_signals: Mapped[list["RiskSignal"]] = relationship(back_populates="matched_blacklist")
