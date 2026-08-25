"""In-app notification model — chuông Profile.

Đặt vào: src/app/models/notification.py
Và export trong models package nếu project có __init__ aggregate.
Chạy migration / create table tương ứng.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

# Chỉnh import Base cho khớp project (một trong các dạng sau):
try:
    from src.app.db.base import Base
except ImportError:
    try:
        from src.app.database import Base
    except ImportError:
        from src.app.db.session import Base  # type: ignore


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(
        String(40), nullable=False, default="product_update"
    )
    version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )