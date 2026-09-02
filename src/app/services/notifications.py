"""Preference-aware creation of durable in-app notifications."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.orm import Session

from src.app.models.notification import Notification
from src.app.models.notification_preference import NotificationPreference

NotificationKind = Literal["transaction", "security", "product_update"]


def _is_enabled(db: Session, user_id: uuid.UUID, kind: NotificationKind) -> bool:
    preference = db.get(NotificationPreference, user_id)
    if kind == "transaction":
        return preference.transaction_enabled if preference else True
    if kind == "security":
        return preference.security_enabled if preference else True
    return preference.promotion_enabled if preference else False


def add_in_app_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    body: str,
    kind: NotificationKind,
    version: str | None = None,
    mandatory: bool = False,
) -> bool:
    """Stage a notification, optionally bypassing preferences for critical security events."""
    if not mandatory and not _is_enabled(db, user_id, kind):
        return False
    db.add(
        Notification(
            user_id=user_id,
            title=title[:200],
            body=body,
            kind=kind,
            version=version,
            is_read=False,
            created_at=datetime.now(UTC),
        )
    )
    return True
