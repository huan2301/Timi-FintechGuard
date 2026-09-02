"""User-isolated persistence for Timi assistant conversations."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class AssistantChatExchange(Base, TimestampMixin):
    """One question/answer pair, always owned by exactly one Timi user.

    ``question_hash`` supports exact-repeat reuse, but it is intentionally
    indexed together with ``user_id``.  A response from one account is never a
    candidate for any other account, even when the text is identical.
    """

    __tablename__ = "assistant_chat_exchanges"
    __table_args__ = (
        Index(
            "ix_assistant_chat_exchanges_user_cache",
            "user_id",
            "question_hash",
            "cache_version",
            "expires_at",
        ),
        Index("ix_assistant_chat_exchanges_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    question_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    out_of_scope: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # ``model`` is an Agent answer; ``policy`` is a local scope refusal.  The
    # value is kept for auditability without storing provider credentials.
    response_source: Mapped[str] = mapped_column(String(20), nullable=False)
    cache_version: Mapped[str] = mapped_column(String(32), nullable=False)
    reuse_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_reused_at: Mapped[datetime | None] = mapped_column(nullable=True)
    expires_at: Mapped[datetime] = mapped_column(nullable=False)
