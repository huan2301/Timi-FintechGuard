"""Audit log service.

Nguyên tắc:
- KHÔNG gọi trực tiếp ở từng route — dùng AuditMiddleware (middleware.py) để tự động.
- Mọi metadata truyền vào phải đã qua mask_transaction_metadata() trước.
- Ghi bất đồng bộ để không block response.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.services.db import AuditLog

logger = logging.getLogger(__name__)


async def log_action(
    db: AsyncSession,
    action: str,
    resource_type: str,
    *,
    actor_id: str | None = None,
    resource_id: str | None = None,
    ip: str | None = None,
    metadata: dict | None = None,
) -> AuditLog | None:
    """Ghi 1 dòng audit log vào DB.

    Args:
        db:            AsyncSession từ dependency get_db()
        action:        Mô tả hành động, ví dụ "POST /api/v1/transactions/analyze"
        resource_type: Loại tài nguyên, ví dụ "transaction"
        actor_id:      ID người dùng thực hiện (None nếu chưa xác thực)
        resource_id:   ID tài nguyên bị tác động (None nếu chưa có)
        ip:            IP của client
        metadata:      Dict đã mask PII — KHÔNG truyền data thô vào đây

    Returns:
        AuditLog instance đã được add vào session (chưa flush),
        hoặc None nếu ghi thất bại (lỗi không lan ra ngoài để không block response).
    """
    try:
        entry = AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip_address=ip,
        )
        entry.set_metadata(metadata or {})
        db.add(entry)
        # Không gọi flush/commit ở đây — để middleware/route tự commit qua get_db()
        logger.debug(f"AuditLog queued: action={action} actor={actor_id} ip={ip}")
        return entry
    except Exception as exc:
        # Audit failure không được làm chết request chính
        logger.error(f"Failed to write audit log: {exc}", exc_info=True)
        return None
