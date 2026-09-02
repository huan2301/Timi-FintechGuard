"""Test kiểm soát truy cập (Access Control) — PDPA Bước 4.4.

Xác nhận: user A không được xem giao dịch của user B (phải nhận 403).

Vì project chưa có hệ thống auth đầy đủ, test này mô phỏng bằng cách:
  - Inject user_id vào request.state thông qua middleware test
  - Kiểm tra route trả 403 khi user không phải owner

Endpoint hiện đã được triển khai; test dùng dependency override để kiểm chứng
quyền sở hữu mà không cần kết nối cơ sở dữ liệu thật.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.app.core.deps import get_current_user
from src.app.db.session import get_db
from src.app.models.transaction import Transaction
from src.app.models.user import User
from src.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_analyze_endpoint_accessible(self, client: AsyncClient):
        """Legacy route must clearly direct clients to the active assessment API."""
        payload = {
            "sender": "user_a",
            "receiver": "Người Nhận B",
            "receiver_account": "9876543210",
            "amount": 1_000_000,
            "description": "test transfer",
        }
        response = await client.post("/api/v1/transactions/analyze", json=payload)
        assert response.status_code == 200
        assert response.json()["status"] == "deprecated"
        assert "/transactions/assess" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_analyze_validation_rejects_empty_sender(self, client: AsyncClient):
        """Pydantic phải reject sender rỗng với 422."""
        payload = {
            "sender": "",
            "receiver": "Test",
            "receiver_account": "123456",
            "amount": 100_000,
        }
        response = await client.post("/api/v1/transactions/analyze", json=payload)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_analyze_validation_rejects_negative_amount(self, client: AsyncClient):
        """Pydantic phải reject amount âm với 422."""
        payload = {
            "sender": "user_a",
            "receiver": "user_b",
            "receiver_account": "123456789",
            "amount": -500,
        }
        response = await client.post("/api/v1/transactions/analyze", json=payload)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_response_does_not_contain_raw_account(self, client: AsyncClient):
        """Response KHÔNG được chứa receiver_account đầy đủ (PDPA data minimization)."""
        raw_account = "0123456789"
        payload = {
            "sender": "user_a",
            "receiver": "Nguyen Van A",
            "receiver_account": raw_account,
            "amount": 5_000_000,
            "description": "test",
        }
        response = await client.post("/api/v1/transactions/analyze", json=payload)
        if response.status_code == 200:
            body = response.text
            assert raw_account not in body, f"Response chứa receiver_account đầy đủ '{raw_account}' — vi phạm PDPA!"

    @pytest.mark.asyncio
    async def test_user_a_cannot_see_user_b_transaction(self, client: AsyncClient):
        """User A cannot read a transaction owned by user B."""
        user_a = User(
            id=uuid.uuid4(),
            email="user-a@example.test",
            full_name="User A",
            hashed_password="unused",
        )
        transaction = Transaction(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            payee_account="0123456789",
            payee_name="User C",
            amount=100_000,
        )
        fake_db = MagicMock()
        fake_db.get.return_value = transaction

        def override_db():
            yield fake_db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: user_a
        try:
            response = await client.get(
                f"/api/v1/transactions/{transaction.id}",
                headers={"Authorization": "Bearer dependency-overridden"},
            )
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 403
        assert response.json()["detail"] == "Bạn không có quyền xem giao dịch này"
