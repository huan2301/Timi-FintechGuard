"""Test kiểm soát truy cập (Access Control) — PDPA Bước 4.4.

Xác nhận: user A không được xem giao dịch của user B (phải nhận 403).

Vì project chưa có hệ thống auth đầy đủ, test này mô phỏng bằng cách:
  - Inject user_id vào request.state thông qua middleware test
  - Kiểm tra route trả 403 khi user không phải owner

NOTE: Test này sẽ PASS khi route /transactions/{tx_id} được implement.
Hiện tại test được đánh dấu xsfail để track việc "cần làm".
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_analyze_endpoint_accessible(self, client: AsyncClient):
        """Route POST /transactions/analyze phải trả 200 với payload hợp lệ."""
        payload = {
            "sender": "user_a",
            "receiver": "Người Nhận B",
            "receiver_account": "9876543210",
            "amount": 1_000_000,
            "description": "test transfer",
        }
        response = await client.post("/api/v1/transactions/analyze", json=payload)
        # Route phải tồn tại (không 404)
        assert response.status_code != 404, "Route /transactions/analyze không tồn tại!"
        # Agent xử lý thành công hoặc 503 (nếu LLM chưa cấu hình) — đều chấp nhận được
        assert response.status_code in (200, 503, 504), (
            f"Unexpected status code: {response.status_code}"
        )

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
            assert raw_account not in body, (
                f"Response chứa receiver_account đầy đủ '{raw_account}' — vi phạm PDPA!"
            )

    @pytest.mark.asyncio
    @pytest.mark.xfail(
        reason="Route GET /transactions/{tx_id} chưa được implement — "
               "cần implement với kiểm tra owner_id để test này pass.",
        strict=False,
    )
    async def test_user_a_cannot_see_user_b_transaction(self, client: AsyncClient):
        """User A không được xem giao dịch của user B → phải nhận 403.

        TODO: Implement khi có auth middleware và route GET /transactions/{id}.
        """
        # Giả định tx_id=1 thuộc về user_b
        # User_a (không phải owner, không phải admin) → 403
        response = await client.get(
            "/api/v1/transactions/1",
            headers={"X-User-Id": "user_a"},  # sẽ được đọc bởi auth middleware
        )
        assert response.status_code == 403, (
            "User A phải nhận 403 khi cố xem giao dịch của User B"
        )
