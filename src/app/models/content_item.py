from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class ContentItem(Base, TimestampMixin):
    """Admin-managed copy, review, or image metadata for a public page."""

    __tablename__ = "content_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    placement: Mapped[str] = mapped_column(String(10), nullable=False, default="middle", server_default="middle")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
