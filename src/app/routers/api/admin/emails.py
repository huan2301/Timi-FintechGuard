"""Admin email broadcast + product update (in-app notifications).

Broadcast  → SMTP email toàn bộ user
Product update → tạo notification in-app (chuông Profile), KHÔNG gửi mail

Mount:
    from src.app.routers.api.admin import emails as admin_emails
    app.include_router(admin_emails.router, prefix="/api/v1")
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.core.deps import require_admin, get_current_user
from src.app.db.session import get_db
from src.app.models.user import User
from src.app.models.newsletter_subscriber import NewsletterSubscriber
from src.app.services.audit import add_audit_log
from src.app.services.email_service import send_email, send_batch_emails, wrap_broadcast_html

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/emails",
    tags=["admin-emails"],
    dependencies=[Depends(require_admin)],
)

# Router riêng cho user đọc thông báo (không require admin)
notifications_router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


class BroadcastRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    html: str = Field(min_length=1, max_length=50_000)
    dry_run: bool = False


class ProductUpdateRequest(BaseModel):
    version: str | None = Field(default=None, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20_000)
    # Giữ field để tương thích UI cũ — bị bỏ qua, không gửi mail
    send_now: bool = True


class BroadcastResult(BaseModel):
    queued: int
    dry_run: bool
    message: str


def _all_users_with_email(db: Session) -> list[tuple[str, str]]:
    users = list(
        db.scalars(
            select(User).where(User.email.is_not(None), User.email != "")
        ).all()
    )
    return [
        (u.email, getattr(u, "full_name", None) or "bạn")
        for u in users
        if u.email
    ]


def _newsletter_recipients(db: Session, existing: list[tuple[str, str]]) -> list[tuple[str, str]]:
    existing_emails = {email.lower() for email, _ in existing}
    return [
        (subscriber.email, "báº¡n")
        for subscriber in db.scalars(select(NewsletterSubscriber)).all()
        if subscriber.email.lower() not in existing_emails
    ]


def _all_user_ids(db: Session) -> list:
    return list(db.scalars(select(User.id)).all())


def _send_batch(
    *,
    recipients: list[tuple[str, str]],
    subject: str,
    html: str,
) -> None:
    wrapped = wrap_broadcast_html(body_html=html, preheader=subject)
    items = [
        {
            "to": email,
            "subject": subject,
            "html": wrapped.replace("{{full_name}}", name or "bạn"),
        }
        for email, name in recipients
    ]
    ok, fail = send_batch_emails(items=items)
    logger.info("Broadcast done: success=%d failed=%d total=%d", ok, fail, len(items))
    print(f"BROADCAST RESULT: ok={ok} fail={fail} total={len(items)}")


def _create_notifications_for_all(
    db: Session,
    *,
    title: str,
    body: str,
    version: str | None,
    actor_id,
) -> int:
    """
    Tạo notification cho mọi user.
    Ưu tiên model Notification nếu có; fallback: bảng đơn giản qua raw SQLAlchemy model.
    """
    try:
        from src.app.models.notification import Notification  # type: ignore
    except ImportError:
        Notification = None  # type: ignore

    user_ids = _all_user_ids(db)
    if not user_ids:
        return 0

    if Notification is not None:
        rows = [
            Notification(
                id=uuid.uuid4(),
                user_id=uid,
                title=title,
                body=body,
                kind="product_update",
                version=version,
                is_read=False,
                created_at=datetime.now(timezone.utc),
            )
            for uid in user_ids
        ]
        db.add_all(rows)
        return len(rows)

    # Fallback: lưu metadata vào audit (tạm) — nên tạo model Notification
    add_audit_log(
        db,
        action="notification.product_update_broadcast",
        actor_id=actor_id,
        resource_type="product_update",
        resource_id=None,
        metadata={
            "title": title,
            "body": body,
            "version": version,
            "recipient_count": len(user_ids),
            "note": "No Notification model — create src.app.models.notification",
        },
    )
    logger.warning(
        "Notification model missing — product update only audited, not pushed to users"
    )
    return 0


@router.post("/broadcast", response_model=BroadcastResult)
def broadcast_email(
    payload: BroadcastRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> BroadcastResult:
    recipients = _all_users_with_email(db)
    recipients.extend(_newsletter_recipients(db, recipients))

    if payload.dry_run:
        admin_email = getattr(admin, "email", None)
        if not admin_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admin chưa có email để gửi thử",
            )
        background_tasks.add_task(
            send_email,
            to=admin_email,
            subject=f"[DRY-RUN] {payload.subject}",
            html=wrap_broadcast_html(
                body_html=payload.html, preheader=payload.subject
            ),
        )
        add_audit_log(
            db,
            action="email.broadcast_dry_run",
            actor_id=admin.id,
            resource_type="email",
            resource_id=None,
            metadata={
                "subject": payload.subject,
                "candidate_count": len(recipients),
            },
        )
        db.commit()
        return BroadcastResult(
            queued=1,
            dry_run=True,
            message=(
                f"Đã xếp hàng gửi thử tới {admin_email}. "
                f"Tổng user có email: {len(recipients)}."
            ),
        )

    if not recipients:
        return BroadcastResult(
            queued=0,
            dry_run=False,
            message="Không có user nào có email.",
        )

    background_tasks.add_task(
        _send_batch,
        recipients=recipients,
        subject=payload.subject,
        html=payload.html,
    )
    add_audit_log(
        db,
        action="email.broadcast",
        actor_id=admin.id,
        resource_type="email",
        resource_id=None,
        metadata={
            "subject": payload.subject,
            "recipient_count": len(recipients),
        },
    )
    db.commit()
    return BroadcastResult(
        queued=len(recipients),
        dry_run=False,
        message=f"Đã xếp hàng gửi {len(recipients)} email tới toàn bộ user.",
    )


@router.post("/product-update", response_model=BroadcastResult)
def publish_product_update(
    payload: ProductUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> BroadcastResult:
    """Công bố cập nhật → thông báo chuông Profile (không gửi mail)."""
    title = payload.title
    if payload.version:
        title = f"[{payload.version}] {payload.title}"

    count = _create_notifications_for_all(
        db,
        title=title,
        body=payload.body,
        version=payload.version,
        actor_id=admin.id,
    )
    add_audit_log(
        db,
        action="notification.product_update",
        actor_id=admin.id,
        resource_type="product_update",
        resource_id=None,
        metadata={
            "version": payload.version,
            "title": payload.title,
            "notification_count": count,
        },
    )
    db.commit()

    if count == 0:
        return BroadcastResult(
            queued=0,
            dry_run=False,
            message=(
                "Chưa tạo được thông báo in-app. "
                "Cần model Notification (xem artifacts/notification_model.py)."
            ),
        )

    return BroadcastResult(
        queued=count,
        dry_run=False,
        message=f"Đã đẩy {count} thông báo cập nhật lên chuông Profile (không gửi mail).",
    )


# ----- User APIs: đọc / đánh dấu đã đọc -----


class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    kind: str
    version: str | None = None
    is_read: bool
    created_at: str

    class Config:
        from_attributes = True


@notifications_router.get("", response_model=list[NotificationOut])
def list_my_notifications(
    limit: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        from src.app.models.notification import Notification
    except ImportError:
        return []

    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        ).all()
    )
    return [
        NotificationOut(
            id=str(r.id),
            title=r.title,
            body=r.body,
            kind=getattr(r, "kind", "product_update") or "product_update",
            version=getattr(r, "version", None),
            is_read=bool(r.is_read),
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@notifications_router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        from src.app.models.notification import Notification
        from sqlalchemy import func

        n = db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
        )
        return {"count": int(n or 0)}
    except ImportError:
        return {"count": 0}


@notifications_router.post("/{notification_id}/read")
def mark_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        from src.app.models.notification import Notification
    except ImportError:
        raise HTTPException(404, "Notification model chưa có")

    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy thông báo")
    row.is_read = True
    db.commit()
    return {"ok": True}


@notifications_router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        from src.app.models.notification import Notification
    except ImportError:
        return {"ok": True, "updated": 0}

    rows = list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
        ).all()
    )
    for r in rows:
        r.is_read = True
    db.commit()
    return {"ok": True, "updated": len(rows)}
