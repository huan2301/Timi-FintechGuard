"""Minimal admin APIs backed by the same fraud-intelligence schema."""

import base64
import binascii
import io
import json
import re
import uuid
from datetime import UTC, datetime

import cloudinary
import cloudinary.uploader
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.agents import get_multi_agent_supervisor
from src.app.config import get_settings
from src.app.core.deps import require_admin
from src.app.core.security import decode_face_verification_token
from src.app.db.session import get_db
from src.app.models.assistant_chat_exchange import AssistantChatExchange
from src.app.models.audit_log import AuditLog
from src.app.models.blacklist import Blacklist
from src.app.models.content_item import ContentItem
from src.app.models.face_enrollment import FaceEnrollment
from src.app.models.intervention_log import InterventionLog
from src.app.models.risk_assessment import RiskLevel, TransactionRiskAssessment, TransactionWarning, WarningDecision
from src.app.models.scam_guardian import ScamRiskEvent
from src.app.models.scam_pattern import ScamPattern
from src.app.models.scam_report import ScamReport
from src.app.models.timi_ledger_entry import TimiLedgerEntry
from src.app.models.transaction import Transaction
from src.app.models.user import User
from src.app.schemas.admin import (
    AdminFaceActionRequest,
    AdminRuntimeSettingsOut,
    AdminTransactionOut,
    AdminUserOut,
    AgentMetricOut,
    AgentMetricsOut,
    AuditLogOut,
    BlacklistCreate,
    BlacklistOut,
    BlacklistPage,
    ContentItemCreate,
    ContentItemOut,
    ContentItemUpdate,
    ScamPatternCreate,
    ScamPatternOut,
    StatsOut,
    UserRoleUpdate,
    UserStatusUpdate,
)
from src.app.schemas.scam import ScamReportOut, ScamReportReview
from src.app.services import risk_rules
from src.app.services.agent_metrics import AgentMetricSnapshot, get_persisted_metrics
from src.app.services.audit import add_audit_log
from src.app.services.url_blacklist import normalize_url_host

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

_BLACKLIST_DEFAULT_PAGE_SIZE = 20
_BLACKLIST_MAX_PAGE_SIZE = 50
_CONTENT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_CONTENT_IMAGE_MAX_SIZE = 8 * 1024 * 1024
_CONTENT_IMAGE_MAX_PIXELS = 40_000_000
_CONTENT_IMAGE_EXTENSIONS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "GIF": ".gif"}


def _delete_unreferenced_local_content_image(db: Session, image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/media/content/"):
        return
    if db.scalar(select(ContentItem.id).where(ContentItem.image_url == image_url).limit(1)):
        return
    upload_dir = (get_settings().project_root / "data" / "uploads" / "content").resolve()
    candidate = (upload_dir / image_url.removeprefix("/media/content/")).resolve()
    if candidate.parent == upload_dir and candidate.is_file():
        candidate.unlink()


@router.post("/content/upload-image", response_model=dict[str, str])
async def upload_content_image(file: UploadFile = File(...)) -> dict[str, str]:
    if file.content_type not in _CONTENT_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF"
        )
    contents = await file.read(_CONTENT_IMAGE_MAX_SIZE + 1)
    if not contents:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Tệp ảnh đang trống")
    if len(contents) > _CONTENT_IMAGE_MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ảnh không được vượt quá 8 MB")
    try:
        with Image.open(io.BytesIO(contents)) as image:
            detected_format = image.format
            if image.width * image.height > _CONTENT_IMAGE_MAX_PIXELS:
                raise ValueError("image dimensions are too large")
            image.verify()
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nội dung tệp không phải ảnh hợp lệ hoặc kích thước ảnh quá lớn",
        ) from exc
    extension = _CONTENT_IMAGE_EXTENSIONS.get(str(detected_format).upper())
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Định dạng ảnh không được hỗ trợ"
        )
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
def update_content_item(
    content_id: uuid.UUID, payload: ContentItemUpdate, db: Session = Depends(get_db)
) -> ContentItem:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nội dung")
    updates = payload.model_dump(exclude_unset=True)
    previous_image_url = item.image_url
    for key, value in updates.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    if "image_url" in updates and previous_image_url != item.image_url:
        _delete_unreferenced_local_content_image(db, previous_image_url)
    return item


@router.delete("/content/{content_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content_item(content_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    item = db.get(ContentItem, content_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nội dung")
    previous_image_url = item.image_url
    db.delete(item)
    db.commit()
    _delete_unreferenced_local_content_image(db, previous_image_url)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _encode_blacklist_cursor(entry: Blacklist) -> str:
    payload = {
        "created_at": entry.created_at.astimezone(UTC).isoformat(),
        "id": str(entry.id),
    }
    return (
        base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii").rstrip("=")
    )


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng")
    return user


def _ensure_not_last_active_admin(db: Session, user: User, *, becoming_admin: bool) -> None:
    """Do not let an admin action remove the application's last active admin."""
    if user.role != "admin" or not user.is_active or becoming_admin:
        return
    active_admins = (
        db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True))) or 0
    )
    if active_admins <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể gỡ quyền hoặc khóa admin đang hoạt động cuối cùng",
        )


@router.get("/settings", response_model=AdminRuntimeSettingsOut)
def get_runtime_settings() -> AdminRuntimeSettingsOut:
    """Expose effective non-secret settings; deployment config remains immutable in the UI."""
    settings = get_settings()
    return AdminRuntimeSettingsOut(
        app_env=settings.app_env,
        guardian_agent_enabled=settings.guardian_agent_enabled,
        guardian_stt_enabled=settings.guardian_stt_enabled,
        llm_explanation_enabled=settings.llm_explanation_enabled,
        task_navigator_agent_enabled=settings.task_navigator_agent_enabled,
        rag_enabled=settings.rag_enabled,
        face_model_preload=settings.face_model_preload,
        risk_rules_version=risk_rules.RULES_VERSION,
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[User]:
    """List accounts for role and account-status administration."""
    return list(db.scalars(select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)).all())


@router.patch("/users/{user_id}/role", response_model=AdminUserOut)
def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id and payload.role != "admin":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể tự hủy quyền admin")
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể tự khóa tài khoản admin")
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
) -> Response:
    """Permanently delete a user when no protected ledger reference exists."""
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Không thể tự xóa tài khoản admin hiện tại")
    _ensure_not_last_active_admin(db, user, becoming_admin=False)
    has_protected_financial_history = bool(
        db.scalar(select(TimiLedgerEntry.id).where(TimiLedgerEntry.user_id == user.id).limit(1))
        or db.scalar(select(Transaction.id).where(Transaction.timi_recipient_user_id == user.id).limit(1))
    )
    if has_protected_financial_history:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa user vì tài khoản đang có dữ liệu giao dịch hoặc sổ cái cần được giữ lại",
        )
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == user.id))
    external_public_ids: list[str] = []
    if user.avatar_url:
        external_public_ids.append(f"fintechguard/avatars/{user.id}")
    if enrollment is not None:
        external_public_ids.append(
            str(
                (enrollment.metadata_json or {}).get("cloudinary_public_id")
                or f"fintechguard/face-enrollments/{user.id}"
            )
        )
    if external_public_ids:
        settings = get_settings()
        if not all(
            (
                settings.cloudinary_cloud_name,
                settings.cloudinary_api_key,
                settings.cloudinary_api_secret,
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Không thể xóa user trước khi cấu hình nơi lưu ảnh Cloudinary",
            )
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        for public_id in external_public_ids:
            try:
                result = cloudinary.uploader.destroy(
                    public_id,
                    invalidate=True,
                    resource_type="image",
                )
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Không thể xóa toàn bộ ảnh cá nhân của user",
                ) from exc
            if str(result.get("result", "")).lower() not in {"ok", "not found"}:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Nơi lưu trữ chưa xác nhận xóa ảnh cá nhân của user",
                )
    add_audit_log(
        db,
        action="user.deleted",
        actor_id=admin.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"deleted_role": user.role},
    )
    db.delete(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa user vì tài khoản đang có dữ liệu giao dịch hoặc sổ cái cần được giữ lại",
        ) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    rows = list(db.scalars(query.order_by(desc(Blacklist.created_at), desc(Blacklist.id)).limit(limit + 1)).all())
    page_rows = rows[:limit]
    return BlacklistPage(
        items=page_rows,
        next_cursor=(_encode_blacklist_cursor(page_rows[-1]) if len(rows) > limit and page_rows else None),
    )


@router.post("/blacklist", response_model=BlacklistOut, status_code=status.HTTP_201_CREATED)
def add_blacklist(
    payload: BlacklistCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
) -> Blacklist:
    entity_value = payload.entity_value.strip()
    bank = payload.bank.strip() if payload.bank else None
    source = payload.source.strip()
    if not entity_value or not source:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Giá trị và nguồn blacklist không được để trống",
        )
    if payload.entity_type == "account":
        entity_value = entity_value.replace(" ", "")
        if not bank:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="STK cần có ngân hàng")
    elif payload.entity_type == "phone":
        entity_value = re.sub(r"[\s.-]", "", entity_value)
        if not re.fullmatch(r"\+?\d{9,15}", entity_value):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Số điện thoại không hợp lệ")
    elif payload.entity_type == "email":
        try:
            entity_value = validate_email(entity_value, check_deliverability=False).normalized.lower()
        except EmailNotValidError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Email không hợp lệ") from exc
    else:
        normalized_host = normalize_url_host(entity_value)
        if normalized_host is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="URL hoặc tên miền không hợp lệ"
            )
        entity_value = normalized_host
        bank = None

    existing = db.scalar(
        select(Blacklist).where(
            Blacklist.entity_type == payload.entity_type,
            Blacklist.entity_value == entity_value,
            Blacklist.bank == bank,
            Blacklist.is_active.is_(True),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bản ghi blacklist đã tồn tại")

    entry = Blacklist(
        **payload.model_dump(exclude={"entity_value", "bank", "source"}),
        entity_value=entity_value,
        bank=bank,
        source=source,
    )
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
) -> Response:
    try:
        decode_face_verification_token(payload.face_verification_token, user_id=str(admin.id))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Xác thực khuôn mặt admin không hợp lệ hoặc đã hết hạn"
        ) from exc
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    add_audit_log(
        db,
        action="scam_report.reviewed",
        actor_id=admin.id,
        resource_type="scam_report",
        resource_id=report.id,
        metadata={"status": payload.status},
    )
    db.commit()
    db.refresh(report)
    return report


@router.get("/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)) -> StatsOut:
    by_level_rows = db.execute(
        select(TransactionRiskAssessment.risk_level, func.count()).group_by(TransactionRiskAssessment.risk_level)
    ).all()
    by_level = {level: count for level, count in by_level_rows}
    high_risk = by_level.get(RiskLevel.HIGH, 0)
    high_risk_cancelled = (
        db.scalar(
            select(func.count())
            .select_from(TransactionWarning)
            .join(TransactionRiskAssessment)
            .where(
                TransactionRiskAssessment.risk_level == RiskLevel.HIGH,
                TransactionWarning.user_decision == WarningDecision.CANCELLED,
            )
        )
        or 0
    )
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
        recommendation_compliance_rate=(round(high_risk_cancelled / high_risk, 4) if high_risk else None),
        blacklist_size=db.scalar(select(func.count()).select_from(Blacklist)) or 0,
        pattern_count=db.scalar(select(func.count()).select_from(ScamPattern)) or 0,
    )


def _latest_created_at(db: Session, model: type, *conditions: object):
    statement = select(func.max(model.created_at))
    if conditions:
        statement = statement.where(*conditions)
    return db.scalar(statement)


def _persistent_agent_events(db: Session, agent_id: str) -> tuple[int, object | None]:
    """Return durable domain events associated with a specialist."""

    if agent_id == "chat_support":
        condition = AssistantChatExchange.response_source.in_(("model", "policy"))
        return (
            int(db.scalar(select(func.count()).select_from(AssistantChatExchange).where(condition)) or 0),
            _latest_created_at(db, AssistantChatExchange, condition),
        )
    if agent_id == "task_navigator":
        condition = AssistantChatExchange.response_source == "task_agent"
        return (
            int(db.scalar(select(func.count()).select_from(AssistantChatExchange).where(condition)) or 0),
            _latest_created_at(db, AssistantChatExchange, condition),
        )
    if agent_id == "call_guardian":
        return (
            int(db.scalar(select(func.count()).select_from(ScamRiskEvent)) or 0),
            _latest_created_at(db, ScamRiskEvent),
        )
    if agent_id == "intervention_agent":
        return (
            int(db.scalar(select(func.count()).select_from(InterventionLog)) or 0),
            _latest_created_at(db, InterventionLog),
        )
    return 0, None


def _agent_metric(
    db: Session,
    *,
    agent_id: str,
    name: str,
    description: str,
    group: str,
    status: str,
    capabilities: list[str],
    api_path: str,
    execution_metric: AgentMetricSnapshot,
) -> AgentMetricOut:
    domain_events, domain_last_activity_at = _persistent_agent_events(db, agent_id)
    return AgentMetricOut(
        agent_id=agent_id,
        name=name,
        description=description,
        group=group,
        status=status,
        capabilities=capabilities,
        api_path=api_path,
        calls=execution_metric.calls,
        successes=execution_metric.successful_calls,
        failures=execution_metric.failed_calls,
        success_rate=execution_metric.success_rate,
        avg_latency_ms=execution_metric.avg_latency_ms,
        last_activity_at=execution_metric.last_activity_at,
        domain_events=domain_events,
        domain_last_activity_at=domain_last_activity_at,
    )


@router.get("/agent-metrics", response_model=AgentMetricsOut)
def agent_metrics(db: Session = Depends(get_db)) -> AgentMetricsOut:
    """Expose supervisor and intervention metrics to the admin dashboard.

    Execution metrics and domain-event counts are both sourced from Neon.
    Agent executions are payload-free rows in ``agent_execution_events``;
    domain events remain the business evidence generated by each specialist.
    """

    supervisor = get_multi_agent_supervisor()
    descriptors = supervisor.registry.descriptors()
    agent_ids = [descriptor.agent_id.value for descriptor in descriptors]
    metrics_by_agent = get_persisted_metrics(
        db,
        [*agent_ids, "intervention_agent"],
    )
    managed_agents = [
        _agent_metric(
            db,
            agent_id=descriptor.agent_id.value,
            name=descriptor.name,
            description=descriptor.description,
            group="supervisor",
            # A registered specialist is available continuously. Execution
            # counts are shown separately, so an idle chatbot is not misreported as
            # offline simply because it has not received a request yet.
            status="active",
            capabilities=[capability.value for capability in descriptor.capabilities],
            api_path=descriptor.api_path,
            execution_metric=metrics_by_agent[descriptor.agent_id.value],
        )
        for descriptor in descriptors
    ]

    supervisor_metrics = [metrics_by_agent[agent_id] for agent_id in agent_ids]
    total_calls = sum(metric.calls for metric in supervisor_metrics)
    total_successes = sum(metric.successful_calls for metric in supervisor_metrics)
    total_failures = sum(metric.failed_calls for metric in supervisor_metrics)
    total_latency = sum((metric.avg_latency_ms or 0) * metric.calls for metric in supervisor_metrics)
    latest_activity = max(
        (metric.last_activity_at for metric in supervisor_metrics if metric.last_activity_at),
        default=None,
    )
    intervention = _agent_metric(
        db,
        agent_id="intervention_agent",
        name="InterventionAgent",
        description="Luồng can thiệp nhiều bước, dừng ở mỗi bước để người dùng tự quyết định.",
        group="standalone",
        status="active",
        capabilities=["multi_step_intervention", "human_in_the_loop"],
        api_path="/api/v1/transactions/{transaction_id}/intervention",
        execution_metric=metrics_by_agent["intervention_agent"],
    )
    return AgentMetricsOut(
        generated_at=datetime.now(UTC),
        supervisor={
            "id": "timi_multi_agent_supervisor",
            "name": "Multi-Agent Supervisor",
            "routing_mode": "deterministic_explicit_agent_id",
            "managed_agent_count": len(managed_agents),
            "dispatches": total_calls,
            "successes": total_successes,
            "failures": total_failures,
            "success_rate": total_successes / total_calls if total_calls else None,
            "avg_latency_ms": total_latency / total_calls if total_calls else None,
            "last_activity_at": latest_activity,
        },
        managed_agents=managed_agents,
        intervention_agent=intervention,
    )


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    action: str | None = Query(default=None, max_length=100),
    resource_type: str | None = Query(default=None, max_length=50),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[AuditLog]:
    """Return masked audit metadata for the admin audit dashboard."""
    statement = select(AuditLog)
    if action:
        statement = statement.where(AuditLog.action == action)
    if resource_type:
        statement = statement.where(AuditLog.resource_type == resource_type)
    statement = statement.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
    return list(db.scalars(statement).all())


@router.get("/transactions", response_model=list[AdminTransactionOut])
def list_transactions(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
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
        .offset(offset)
        .limit(limit)
    ).all()
    result = []
    for transaction, user_name, risk_level in rows:
        result.append(
            {
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
            }
        )
    return result
