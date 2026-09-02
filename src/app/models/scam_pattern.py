import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ARRAY, Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from src.app.models.model_registry import IntelligenceSource
    from src.app.models.risk_assessment import RiskSignal


class ScamPattern(Base, TimestampMixin):
    __tablename__ = "scam_patterns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pattern_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[list[str] | None] = mapped_column(ARRAY(String(120)), nullable=True)
    risk_weight: Mapped[float] = mapped_column(Numeric(5, 4), default=0.5, nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("intelligence_sources.id", ondelete="SET NULL"), nullable=True
    )

    # Qdrant/pgvector adapter uses this stable ID; embeddings are not duplicated
    # as JSON in the transactional PostgreSQL schema.
    vector_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding_updated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    source: Mapped["IntelligenceSource | None"] = relationship(back_populates="scam_patterns")
    matched_signals: Mapped[list["RiskSignal"]] = relationship(back_populates="matched_pattern")
