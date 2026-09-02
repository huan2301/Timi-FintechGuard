"""Database setup và ORM models.

Sử dụng SQLAlchemy async với SQLite (dev) / PostgreSQL (prod).
Alembic quản lý migration — chạy `alembic upgrade head` sau khi thêm model.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from src.config import get_settings

# ── Engine & Session ────────────────────────────────────────────────────────


def _make_engine():
    settings = get_settings()
    db_url = settings.database_url

    # SQLAlchemy async cần driver aiosqlite / asyncpg
    if db_url.startswith("sqlite:///"):
        db_url = db_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}
    return create_async_engine(db_url, echo=False, connect_args=connect_args)


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — cung cấp DB session cho mỗi request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Base ────────────────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    pass


# ── Models ──────────────────────────────────────────────────────────────────


class Transaction(Base):
    """Lưu lịch sử giao dịch được phân tích.

    receiver_account được lưu dạng thô ở đây (scope demo).
    Nếu cần bảo mật cao hơn, dùng encrypt_field() từ pdpa.py trước khi lưu.
    """

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sender: Mapped[str] = mapped_column(String(200), nullable=False)
    receiver: Mapped[str] = mapped_column(String(200), nullable=False)
    # Lưu đã mask ở đây để không cần decrypt khi đọc log
    receiver_account_masked: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    warning_level: Mapped[str] = mapped_column(String(20), default="safe")
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    explanation: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Bảng audit log — ghi lại mọi hành động nhạy cảm.

    metadata_json KHÔNG được chứa số tài khoản / tên đầy đủ (PDPA).
    Kiểm chứng bằng test_audit.py.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Metadata đã mask — không chứa PII thô
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def set_metadata(self, data: dict) -> None:
        """Ghi metadata (phải đã mask PDPA trước khi gọi hàm này)."""
        self.metadata_json = json.dumps(data, ensure_ascii=False)

    def get_metadata(self) -> dict:
        return json.loads(self.metadata_json)


async def init_db() -> None:
    """Tạo tất cả bảng nếu chưa tồn tại (dùng cho dev/test).
    Production nên dùng Alembic migration thay thế.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
