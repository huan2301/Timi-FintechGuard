import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.risk_assessment import TransactionWarning
    from src.app.models.transaction import Transaction


class InterventionLog(Base, TimestampMixin):
    __tablename__ = "intervention_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    warning_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transaction_warnings.id", ondelete="CASCADE"), nullable=True
    )
    agent_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    node_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    step_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    agent_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_factors: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    suggested_actions: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)

    transaction: Mapped["Transaction"] = relationship()
    warning: Mapped["TransactionWarning | None"] = relationship(back_populates="intervention_logs")
