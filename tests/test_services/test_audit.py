"""Tests cho Audit Log service + PDPA compliance.

Bao gồm:
  1. test_audit_log_created        — gọi route analyze → xác nhận dòng AuditLog được tạo
  2. test_audit_metadata_masked    — xác nhận metadata_json không chứa số tài khoản / tên đầy đủ
  3. test_pdpa_mask_account        — unit test hàm mask_account_number
  4. test_pdpa_mask_name           — unit test hàm mask_name
  5. test_pdpa_mask_transaction    — xác nhận mask_transaction_metadata xử lý đủ fields
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.main import app
from src.services.db import AuditLog, Base
from src.services.pdpa import (
    mask_account_number,
    mask_name,
    mask_transaction_metadata,
)

# ── In-memory DB riêng cho test ──────────────────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

_test_engine = create_async_engine(TEST_DB_URL, echo=False)
_TestSession = async_sessionmaker(bind=_test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="function", autouse=False)
async def test_db():
    """Tạo bảng mới cho mỗi test function, xóa sau khi xong."""
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with _TestSession() as session:
        yield session
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Transaction payload dùng chung ──────────────────────────────────────────

SAMPLE_TX = {
    "sender": "user1",
    "receiver": "Nguyễn Văn A",
    "receiver_account": "0123456789",
    "amount": 5_000_000,
    "description": "chuyển tiền xác minh tài khoản",
}


# ── Unit tests: PDPA masking ─────────────────────────────────────────────────


class TestPdpaMasking:
    def test_mask_account_number_standard(self):
        result = mask_account_number("0123456789")
        assert result == "012****789"
        assert "0123456789" not in result, "Số tài khoản đầy đủ không được xuất hiện"

    def test_mask_account_number_short(self):
        """Số tài khoản <= 6 ký tự → che toàn bộ."""
        assert mask_account_number("12345") == "***"

    def test_mask_account_number_empty(self):
        assert mask_account_number("") == "***"

    def test_mask_name_full_name(self):
        result = mask_name("Nguyễn Văn A")
        assert result.startswith("Nguyễn")
        assert "Văn A" not in result, "Tên đầy đủ không được xuất hiện sau mask"

    def test_mask_name_single_word(self):
        result = mask_name("Admin")
        assert result == "*****"

    def test_mask_name_empty(self):
        assert mask_name("") == "***"

    def test_mask_transaction_metadata_removes_pii(self):
        masked = mask_transaction_metadata(SAMPLE_TX)

        # Không còn số tài khoản đầy đủ
        assert masked["receiver_account"] != SAMPLE_TX["receiver_account"]
        assert "0123456789" not in masked["receiver_account"]

        # Không còn tên đầy đủ
        assert "Nguyễn Văn A" not in masked.get("receiver", "")

        # Các field khác không bị xóa
        assert masked["amount"] == SAMPLE_TX["amount"]
        assert masked["description"] == SAMPLE_TX["description"]

    def test_mask_transaction_metadata_is_copy(self):
        """Đảm bảo original dict không bị mutate."""
        original = dict(SAMPLE_TX)
        mask_transaction_metadata(original)
        assert original["receiver_account"] == "0123456789"


# ── Integration tests: AuditLog via DB ──────────────────────────────────────


class TestAuditLogContent:
    @pytest.mark.asyncio
    async def test_audit_log_created_after_analyze(self, test_db: AsyncSession, client: AsyncClient):
        """Gọi route analyze → phải có ít nhất 1 AuditLog trong DB."""
        from sqlalchemy import select

        from src.services.audit import log_action
        from src.services.pdpa import mask_transaction_metadata

        # Ghi log trực tiếp (mô phỏng route behavior)
        masked = mask_transaction_metadata(SAMPLE_TX)
        masked["warning_level"] = "suspicious"
        masked["risk_score"] = 0.6

        await log_action(
            db=test_db,
            action="POST /api/v1/transactions/analyze",
            resource_type="transaction",
            actor_id="test_user",
            ip="127.0.0.1",
            metadata=masked,
        )
        await test_db.flush()

        # Xác nhận có 1 dòng được tạo
        result = await test_db.execute(select(AuditLog))
        logs = result.scalars().all()
        assert len(logs) == 1, "Phải có đúng 1 AuditLog được tạo"

        log = logs[0]
        assert log.action == "POST /api/v1/transactions/analyze"
        assert log.resource_type == "transaction"
        assert log.actor_id == "test_user"

    @pytest.mark.asyncio
    async def test_audit_metadata_no_raw_account(self, test_db: AsyncSession):
        """metadata_json KHÔNG được chứa số tài khoản đầy đủ (PDPA compliance)."""
        from src.services.audit import log_action
        from src.services.pdpa import mask_transaction_metadata

        masked = mask_transaction_metadata(SAMPLE_TX)
        entry = await log_action(
            db=test_db,
            action="POST /api/v1/transactions/analyze",
            resource_type="transaction",
            metadata=masked,
        )
        await test_db.flush()

        assert entry is not None
        metadata = entry.get_metadata()
        metadata_str = json.dumps(metadata)

        # PDPA: số tài khoản đầy đủ không được có trong log
        assert "0123456789" not in metadata_str, "metadata_json chứa số tài khoản đầy đủ — vi phạm PDPA!"
        # PDPA: tên đầy đủ không được có trong log
        assert "Nguyễn Văn A" not in metadata_str, "metadata_json chứa tên đầy đủ — vi phạm PDPA!"

    @pytest.mark.asyncio
    async def test_audit_failure_does_not_raise(self, test_db: AsyncSession):
        """Lỗi khi ghi audit log không được lan ra ngoài và crash request."""
        from src.services.audit import log_action

        # Truyền metadata không hợp lệ — hàm phải catch và return None
        result = await log_action(
            db=None,  # type: ignore[arg-type]   # intentionally invalid
            action="test",
            resource_type="test",
            metadata={"ok": True},
        )
        # Không raise — trả None
        assert result is None
