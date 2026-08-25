from __future__ import annotations

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin

# Keep this in sync with Settings.embedding_dim and the migration. Changing it
# requires a new embedding index, never an in-place silent change.
PUBLIC_CONTENT_EMBEDDING_DIM = 1536


class ContentChunk(Base, TimestampMixin):
    """One searchable, public chunk derived from an admin-managed content item."""

    __tablename__ = "content_chunks"
    __table_args__ = (
        Index("ix_content_chunks_page_published", "page_key", "is_published"),
        Index("ix_content_chunks_item_order", "content_item_id", "chunk_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    content_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_key: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String(255), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(PUBLIC_CONTENT_EMBEDDING_DIM), nullable=True
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
