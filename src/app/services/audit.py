"""Small, synchronous audit helper for the active FastAPI application."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.app.models.audit_log import AuditLog

_SENSITIVE_KEYS = {
    "account",
    "account_number",
    "payee_account",
    "phone",
    "email",
    "note",
    "description",
}


def _mask_metadata(value: Any, key: str | None = None) -> Any:
    if key in _SENSITIVE_KEYS:
        return "[redacted]"
    if isinstance(value, dict):
        return {str(k): _mask_metadata(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_metadata(item) for item in value]
    return value


def add_audit_log(
    db: Session,
    *,
    action: str,
    actor_id: uuid.UUID | None,
    resource_type: str,
    resource_id: uuid.UUID | None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Queue an audit row without logging sensitive transaction content."""
    db.add(
        AuditLog(
            action=action,
            actor_id=actor_id,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=_mask_metadata(metadata or {}),
        )
    )
