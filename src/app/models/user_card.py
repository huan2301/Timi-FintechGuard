from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class UserCard(Base, TimestampMixin):
    __tablename__ = "user_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    nickname: Mapped[str] = mapped_column(String(80), nullable=False)
    card_number_encrypted: Mapped[str] = mapped_column(String(1000), nullable=False)
    cvv_encrypted: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    holder_name: Mapped[str] = mapped_column(String(255), nullable=False)
    expiry_month: Mapped[int] = mapped_column(Integer, nullable=False)
    expiry_year: Mapped[int] = mapped_column(Integer, nullable=False)
    brand: Mapped[str] = mapped_column(String(40), nullable=False, default="Visa", server_default="Visa")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
