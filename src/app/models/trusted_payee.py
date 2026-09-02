import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.app.db.base import Base, TimestampMixin


class TrustedPayee(Base, TimestampMixin):
    """Người nhận mà user đã tự đánh dấu an toàn.

    Dùng để giảm mức cảnh báo cho các lần chuyển sau, tránh làm phiền
    (yêu cầu 5.4 trong PRD).
    """

    __tablename__ = "trusted_payees"
    __table_args__ = (UniqueConstraint("user_id", "payee_account", name="uq_trusted_user_payee"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    payee_account: Mapped[str] = mapped_column(String(64), nullable=False)
    payee_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<TrustedPayee {self.payee_account}>"
