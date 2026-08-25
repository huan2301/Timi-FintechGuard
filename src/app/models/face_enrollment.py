"""Biometric enrollment records kept separate from profile avatars."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class FaceEnrollment(Base, TimestampMixin):
    __tablename__ = "face_enrollments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    reference_image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    reference_embedding: Mapped[list[float]] = mapped_column(JSONB, nullable=False)
    model_id: Mapped[str] = mapped_column(String(255), nullable=False)
    similarity_threshold: Mapped[float] = mapped_column(nullable=False)
    consent_at: Mapped[datetime] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
