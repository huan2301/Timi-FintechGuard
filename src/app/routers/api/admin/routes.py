"""Minimal admin APIs backed by the same fraud-intelligence schema."""

import base64
import binascii
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.core.deps import require_admin
from src.app.config import get_settings
from src.app.core.security import decode_face_verification_token
from src.app.db.session import get_db
from src.app.models.audit_log import AuditLog
from src.app.models.blacklist import Blacklist
from src.app.models.content_item import ContentItem
from src.app.models.risk_assessment import RiskLevel, TransactionRiskAssessment, TransactionWarning, WarningDecision
from src.app.models.scam_pattern import ScamPattern
from src.app.models.scam_report import ScamReport
from src.app.models.transaction import Transaction
from src.app.models.user import User
from src.app.schemas.admin import (
    AdminTransactionOut,
    ContentItemCreate,
    ContentItemOut,
    ContentItemUpdate,
    AdminFaceActionRequest,
    AdminUserOut,
    AuditLogOut,
    BlacklistCreate,
    BlacklistOut,
    BlacklistPage,
    ScamPatternCreate,
    ScamPatternOut,
    StatsOut,
    UserRoleUpdate,
    UserStatusUpdate,
)
from src.app.schemas.scam import ScamReportOut, ScamReportReview
from src.app.services.audit import add_audit_log

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

_BLACKLIST_DEFAULT_PAGE_SIZE = 20
_BLACKLIST_MAX_PAGE_SIZE = 50
_CONTENT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_CONTENT_IMAGE_MAX_SIZE = 8 * 1024 * 1024


@router.post("/content/upload-image", response_model=dict[str, str])
async def upload_content_image(file: UploadFile = File(...)) -> dict[str, str]:
    if file.content_type not in _CONTENT_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF")
    contents = await file.read()
    if len(contents) > _CONTENT_IMAGE_MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ảnh không được vượt quá 8 MB")
    extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}[file.content_type]
    upload_dir = get_settings().project_root / "data" / "uploads" / "content"
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    (upload_dir / filename).write_bytes(contents)
    return {"image_url": f"/media/content/{filename}"}


@router.get("/content", response_model=list[ContentItemOut])
def list_content_items(
    page_key: str | None = Query(default=None, max_length=64),
    content_type: str | None = Query(default=None, max_length=20),
    db: Session = Depends(get_db),
) -> list[ContentItem]:
    """List all admin-managed public-page content, newest records last by order."""
    query = select(ContentItem).order_by(ContentItem.page_key, ContentItem.sort_order, ContentItem.created_at.desc())
    if page_key:
        query = query.where(ContentItem.page_key == page_key)
    if content_type:
        query = query.where(ContentItem.content_type == content_type)
    return list(db.scalars(query).all())


@router.post("/content", response_model=ContentItemOut, status_code=status.HTTP_201_CREATED)
def create_content_item(payload: ContentItemCreate, db: Session = Depends(get_db)) -> ContentItem:
    item = ContentItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/content/{content_id}", response_model=ContentItemOut)
def update_content_item(content_id: uuid.UUID, payload: ContentItemUpdate, db: Session = Depends(get_db)) -> ContentItem:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nội dung")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content_item(content_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nội dung")
    db.delete(item)
    db.commit()


def _encode_blacklist_cursor(entry: Blacklist) -> str:
    payload = {
        "created_at": entry.created_at.astimezone(UTC).isoformat(),
        "id": str(entry.id),
    }
    return base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")


def _decode_blacklist_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        decoded = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        payload = json.loads(decoded.decode("utf-8"))
        created_at = datetime.fromisoformat(payload["created_at"])
        entry_id = uuid.UUID(payload["id"])
        if created_at.tzinfo is None:
            raise ValueError("cursor timestamp has no timezone")
        return created_at.astimezone(UTC), entry_id
    except (binascii.Error, KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Cursor blacklist không hợp lệ") from None


def _get_user_or_404(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng")
    return user


def _ensure_not_last_active_admin(db: Session, user: User, *, becoming_admin: bool) -> None:
    """Do not let an admin action remove the application's last active admin."""
    if user.role != "admin" or not user.is_active or becoming_admin:
        return
    active_admins = db.scalar(
        select(func.count()).select_from(User).where(
            User.role == "admin", User.is_active.is_(True)
        )
    ) or 0
    if active_admins <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="KhÃ´ng thá»ƒ gá»¡ quyá»n hoáº·c khÃ³a admin Ä‘ang hoáº¡t Ä‘á»™ng cuá»‘i cÃ¹ng",
        )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[User]:
    """List accounts for role and account-status administration."""
    return list(db.scalars(select(User).order_by(User.created_at.desc()).limit(limit)).all())


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="KhÃ´ng thá»ƒ tá»± thá»§y quyá»n admin")
    _ensure_not_last_active_admin(db, user, becoming_admin=payload.role == "admin")
    previous_role = user.role
    user.role = payload.role
    add_audit_log(
        db,
        action="user.role_updated",
        actor_id=admin.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"previous_role": previous_role, "new_role": user.role},
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=AdminUserOut)
def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id and not payload.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="KhÃ´ng thá»ƒ tá»± khÃ³a tÃ i khoáº£n admin")
    _ensure_not_last_active_admin(db, user, becoming_admin=payload.is_active)
    previous_status = user.is_active
    user.is_active = payload.is_active
    add_audit_log(
        db,
        action="user.status_updated",
        actor_id=admin.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"previous_is_active": previous_status, "new_is_active": user.is_active},
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    """Permanently delete a user when no protected ledger reference exists."""
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể tự xóa tài khoản admin hiện tại")
    _ensure_not_last_active_admin(db, user, becoming_admin=False)
    add_audit_log(db, action="user.deleted", actor_id=admin.id, resource_type="user", resource_id=user.id, metadata={"deleted_email": user.email})
    db.delete(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể xóa user vì tài khoản đang có dữ liệu giao dịch hoặc sổ cái cần được giữ lại") from None


@router.get("/blacklist", response_model=BlacklistPage)
def list_blacklist(
    limit: int = Query(default=_BLACKLIST_DEFAULT_PAGE_SIZE, ge=1, le=_BLACKLIST_MAX_PAGE_SIZE),
    cursor: str | None = None,
    entity_type: str | None = Query(default=None, pattern="^(account|phone|email|url)$"),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    db: Session = Depends(get_db),
) -> BlacklistPage:
    """Return a newest-first keyset page instead of the whole blacklist."""
    seek_created_at: datetime | None = None
    seek_entry_id: uuid.UUID | None = None
    if cursor:
        seek_created_at, seek_entry_id = _decode_blacklist_cursor(cursor)

    seek_filter = (
        or_(
            Blacklist.created_at < seek_created_at,
            and_(
                Blacklist.created_at == seek_created_at,
                Blacklist.id < seek_entry_id,
            ),
        )
        if seek_created_at is not None and seek_entry_id is not None
        else None
    )
    query = select(Blacklist).where(Blacklist.is_active.is_(True))
    if entity_type is not None:
        query = query.where(Blacklist.entity_type == entity_type)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Blacklist.entity_value.ilike(search_pattern),
                Blacklist.bank.ilike(search_pattern),
                Blacklist.source.ilike(search_pattern),
            )
        )
    if seek_filter is not None:
        query = query.where(seek_filter)
    rows = list(
        db.scalars(
            query.order_by(desc(Blacklist.created_at), desc(Blacklist.id)).limit(limit + 1)
        ).all()
    )
    page_rows = rows[:limit]
    return BlacklistPage(
        items=page_rows,
        next_cursor=(
            _encode_blacklist_cursor(page_rows[-1])
            if len(rows) > limit and page_rows
            else None
        ),
    )


@router.post("/blacklist", response_model=BlacklistOut, status_code=status.HTTP_201_CREATED)
def add_blacklist(
    payload: BlacklistCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> Blacklist:
    existing = db.scalar(
        select(Blacklist).where(
            Blacklist.entity_type == payload.entity_type,
            Blacklist.entity_value == payload.entity_value,
            Blacklist.bank == payload.bank,
            Blacklist.is_active.is_(True),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bản ghi blacklist đã tồn tại")

    entry = Blacklist(**payload.model_dump())
    db.add(entry)
    db.flush()
    add_audit_log(
        db,
        action="blacklist.created",
        actor_id=admin.id,
        resource_type="blacklist",
        resource_id=entry.id,
        metadata={"entity_type": entry.entity_type, "source": entry.source},
    )
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/blacklist/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_blacklist(
    entry_id: uuid.UUID,
    payload: AdminFaceActionRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> None:
    try:
        decode_face_verification_token(payload.face_verification_token, user_id=str(admin.id))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Xác thực khuôn mặt admin không hợp lệ hoặc đã hết hạn") from exc
    entry = db.get(Blacklist, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bản ghi")
    entry.is_active = False
    add_audit_log(
        db,
        action="blacklist.deactivated",
        actor_id=admin.id,
        resource_type="blacklist",
        resource_id=entry.id,
    )
    db.commit()


@router.get("/scam-patterns", response_model=list[ScamPatternOut])
def list_scam_patterns(db: Session = Depends(get_db)) -> list[ScamPattern]:
    return list(db.scalars(select(ScamPattern).order_by(ScamPattern.created_at.desc())).all())


@router.post("/scam-patterns", response_model=ScamPatternOut, status_code=status.HTTP_201_CREATED)
def add_scam_pattern(
    payload: ScamPatternCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> ScamPattern:
    existing = db.scalar(select(ScamPattern).where(ScamPattern.pattern_name == payload.pattern_name))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tên pattern đã tồn tại")
    pattern = ScamPattern(**payload.model_dump())
    db.add(pattern)
    db.flush()
    add_audit_log(
        db,
        action="scam_pattern.created",
        actor_id=admin.id,
        resource_type="scam_pattern",
        resource_id=pattern.id,
        metadata={"pattern_name": pattern.pattern_name},
    )
    db.commit()
    db.refresh(pattern)
    return pattern


@router.get("/scam-reports", response_model=list[ScamReportOut])
def list_scam_reports(db: Session = Depends(get_db)) -> list[ScamReport]:
    return list(db.scalars(select(ScamReport).order_by(ScamReport.created_at.desc())).all())


@router.patch("/scam-reports/{report_id}", response_model=ScamReportOut)
def review_scam_report(
    report_id: uuid.UUID,
    payload: ScamReportReview,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> ScamReport:
    report = db.get(ScamReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scam report not found")
    report.status = payload.status
    report.admin_note = payload.admin_note
    add_audit_log(db, action="scam_report.reviewed", actor_id=admin.id,
                  resource_type="scam_report", resource_id=report.id,
                  metadata={"status": payload.status})
    db.commit()
    db.refresh(report)
    return report


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    by_level_rows = db.execute(
        select(TransactionRiskAssessment.risk_level, func.count())
        .group_by(TransactionRiskAssessment.risk_level)
    ).all()
    by_level = {level: count for level, count in by_level_rows}
    high_risk = by_level.get(RiskLevel.HIGH, 0)
    high_risk_cancelled = db.scalar(
        select(func.count())
        .select_from(TransactionWarning)
        .join(TransactionRiskAssessment)
        .where(
            TransactionRiskAssessment.risk_level == RiskLevel.HIGH,
            TransactionWarning.user_decision == WarningDecision.CANCELLED,
        )
    ) or 0
    return StatsOut(
        total_transactions=db.scalar(select(func.count()).select_from(Transaction)) or 0,
        by_risk_level={
            RiskLevel.SAFE: by_level.get(RiskLevel.SAFE, 0),
            RiskLevel.LOW: by_level.get(RiskLevel.LOW, 0),
            RiskLevel.MEDIUM: by_level.get(RiskLevel.MEDIUM, 0),
            RiskLevel.HIGH: high_risk,
        },
        high_risk_count=high_risk,
        high_risk_cancelled=high_risk_cancelled,
        recommendation_compliance_rate=(
            round(high_risk_cancelled / high_risk, 4) if high_risk else None
        ),
        blacklist_size=db.scalar(select(func.count()).select_from(Blacklist)) or 0,
        pattern_count=db.scalar(select(func.count()).select_from(ScamPattern)) or 0,
    )


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    action: str | None = Query(default=None, max_length=100),
    resource_type: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    """Return masked audit metadata for the admin audit dashboard."""
    statement = select(AuditLog)
    if action:
        statement = statement.where(AuditLog.action == action)
    if resource_type:
        statement = statement.where(AuditLog.resource_type == resource_type)
    statement = statement.order_by(AuditLog.created_at.desc()).limit(limit)
    return list(db.scalars(statement).all())


@router.get("/transactions", response_model=list[AdminTransactionOut])
def list_transactions(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return real transactions with their latest risk assessment for admin views."""
    latest_assessment = (
        select(
            TransactionRiskAssessment.transaction_id,
            func.max(TransactionRiskAssessment.created_at).label("latest_created_at"),
        )
        .group_by(TransactionRiskAssessment.transaction_id)
        .subquery()
    )
    rows = db.execute(
        select(Transaction, User.full_name, TransactionRiskAssessment.risk_level)
        .join(User, Transaction.user_id == User.id)
        .outerjoin(latest_assessment, latest_assessment.c.transaction_id == Transaction.id)
        .outerjoin(
            TransactionRiskAssessment,
            and_(
                TransactionRiskAssessment.transaction_id == Transaction.id,
                TransactionRiskAssessment.created_at == latest_assessment.c.latest_created_at,
            ),
        )
        .order_by(Transaction.created_at.desc())
        .limit(limit)
    ).all()
    result = []
    for transaction, user_name, risk_level in rows:
        result.append({
            "id": transaction.id,
            "user_id": transaction.user_id,
            "user_name": user_name,
            "payee_account": transaction.payee_account,
            "payee_name": transaction.payee_name,
            "bank_code": transaction.bank_code,
            "amount": transaction.amount,
            "transaction_status": transaction.transaction_status,
            "risk_level": risk_level,
            "created_at": transaction.created_at,
        })
    return result
