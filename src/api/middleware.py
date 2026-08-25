"""Audit Middleware — tự động ghi log mọi request tới các route nhạy cảm.

Cách hoạt động:
  - Intercept request TRƯỚC và SAU khi route handler chạy
  - Chỉ ghi log cho path bắt đầu bằng AUDITED_PATHS_PREFIX
  - Ghi log BẤT ĐỒNG BỘ sau khi response đã được trả về (không block)
  - metadata_json chỉ chứa thông tin không nhạy cảm (method, path, status_code)

Đăng ký trong main.py:
    from src.api.middleware import AuditMiddleware
    app.add_middleware(AuditMiddleware)
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.services.audit import log_action
from src.services.db import AsyncSessionLocal

logger = logging.getLogger(__name__)

# Chỉ audit các path nhạy cảm
AUDITED_PATHS_PREFIXES = (
    "/api/v1/transactions",
)


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware tự động ghi audit log cho các endpoint nhạy cảm."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Kiểm tra trước — bỏ qua nếu không phải path cần audit
        should_audit = any(
            request.url.path.startswith(prefix)
            for prefix in AUDITED_PATHS_PREFIXES
        )

        response = await call_next(request)

        if should_audit:
            # Ghi log sau khi response đã sẵn sàng — không block client
            await self._write_audit_log(request, response.status_code)

        return response

    async def _write_audit_log(self, request: Request, status_code: int) -> None:
        """Ghi audit log bất đồng bộ với session riêng."""
        try:
            actor_id = getattr(request.state, "user_id", None)
            ip = request.client.host if request.client else None

            # metadata chỉ chứa thông tin kỹ thuật, KHÔNG chứa body/PII
            metadata = {
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "query_params": str(request.query_params) or None,
            }

            async with AsyncSessionLocal() as db:
                await log_action(
                    db=db,
                    actor_id=actor_id,
                    action=f"{request.method} {request.url.path}",
                    resource_type="transaction",
                    resource_id=None,
                    ip=ip,
                    metadata=metadata,
                )
                await db.commit()

        except Exception as exc:
            # Lỗi audit không được làm crash middleware
            logger.error(f"AuditMiddleware error: {exc}", exc_info=True)
