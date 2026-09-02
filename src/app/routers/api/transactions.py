"""Transaction flow: assess -> warning -> human decision -> final status."""

from __future__ import annotations

import base64
import hashlib
import json
import time
import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import and_, desc, func, lateral, or_, select, true, union_all
from sqlalchemy.orm import Session, aliased

from src.agents.intervention_graph import intervention_graph
from src.agents.transaction_graph import transaction_graph
from src.app.config import get_settings
from src.app.core.deps import get_current_user
from src.app.core.policies import MAX_DAILY_OUTGOING_VND
from src.app.core.security import (
    JWTError,
    decode_face_verification_token,
    decode_recipient_lookup_token,
    verify_password,
)
from src.app.db.session import get_db
from src.app.models.blacklist import Blacklist
from src.app.models.recipient_directory import RecipientDirectory
from src.app.models.risk_assessment import (
    RiskLevel,
    RiskSignal,
    TransactionRiskAssessment,
    TransactionWarning,
    WarningDecision,
    WarningFeedback,
)
from src.app.models.saved_recipient import SavedRecipient
from src.app.models.scam_guardian import ScamGuardianSession
from src.app.models.scam_report import ScamReport
from src.app.models.transaction import Transaction, TransactionEnvironment, TransactionStatus
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.models.user import User, UserRole
from src.app.schemas.risk import (
    AssessRequest,
    AssessResponse,
    DecisionRequest,
    DecisionResponse,
    InterventionOut,
    InterventionRequest,
    RiskSignalOut,
    SavedRecipientCreate,
    SavedRecipientOut,
    TransactionHistoryPage,
    TransactionHistorySummary,
    TransactionOut,
    TrustedRecipientCreate,
    WarningFeedbackCreate,
    WarningOut,
)
from src.app.schemas.scam import ScamReportCreate, ScamReportOut
from src.app.services import risk_rules
from src.app.services.agent_metrics import record_agent_call
from src.app.services.audit import add_audit_log
from src.app.services.auth_throttle import clear_failures, lock_remaining_seconds, record_failure
from src.app.services.bank_normalization import normalize_bank_name
from src.app.services.blacklist_policy import promote_blacklist_if_eligible
from src.app.services.guardian_alert_window import (
    RecentGuardianAlert,
    guardian_alert_elapsed_label,
    recent_guardian_alert_for_user,
)
from src.app.services.notifications import add_in_app_notification
from src.app.services.timi_bank import (
    InsufficientTimiBalance,
    TimiSelfTransfer,
    TimiTransferError,
    apply_timi_transfer,
    find_active_timi_recipient,
    is_timi_bank,
    lock_timi_transfer_parties,
)
from src.app.services.transaction_authentication import (
    requires_face_verification as requires_transfer_face_verification,
)
from src.app.services.transaction_telemetry import (
    RiskTelemetry,
    build_risk_telemetry,
    persist_risk_telemetry,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])
_HISTORY_TIME_ZONE = ZoneInfo("Asia/Ho_Chi_Minh")
_HISTORY_DEFAULT_PAGE_SIZE = 20
_HISTORY_MAX_PAGE_SIZE = 50


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _completed_outgoing_today(db: Session, user_id: uuid.UUID) -> int:
    local_start = datetime.now(_HISTORY_TIME_ZONE).replace(hour=0, minute=0, second=0, microsecond=0)
    total = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.transaction_status == TransactionStatus.COMPLETED,
            Transaction.created_at >= local_start.astimezone(UTC),
        )
    )
    return int(total or 0)


def _request_peer_ip(request: Request) -> str | None:
    """Return only the direct ASGI peer; forwarded headers are not trusted."""
    return request.client.host if request.client is not None else None


def _saved_recipient_outputs(db: Session, recipients: list[SavedRecipient]) -> list[SavedRecipientOut]:
    """Attach the current avatar for saved Timi recipients in one query."""
    timi_accounts = {recipient.account_number for recipient in recipients if is_timi_bank(recipient.bank_code)}
    avatar_by_account = (
        {
            phone: avatar_url
            for phone, avatar_url in db.execute(
                select(User.phone, User.avatar_url).where(
                    User.phone.in_(timi_accounts),
                    User.is_active.is_(True),
                    User.timi_bank_enabled.is_(True),
                )
            ).all()
            if phone
        }
        if timi_accounts
        else {}
    )
    return [
        SavedRecipientOut(
            id=recipient.id,
            recipient_name=recipient.recipient_name,
            account_number=recipient.account_number,
            bank_code=recipient.bank_code,
            saved_at=recipient.saved_at,
            avatar_url=avatar_by_account.get(recipient.account_number),
        )
        for recipient in recipients
    ]


def _sync_completed_recipient(db: Session, transaction: Transaction) -> None:
    """Add a successfully transferred recipient to the shared directory."""
    bank_code = normalize_bank_name(transaction.bank_code)
    if is_timi_bank(bank_code):
        # Timi recipients are always resolved from the live user account; do
        # not keep a stale duplicate in the generic recipient directory.
        return
    account_number = transaction.payee_account.replace(" ", "").strip()
    if not bank_code or not account_number:
        return

    entry = db.scalar(
        select(RecipientDirectory).where(
            RecipientDirectory.account_number == account_number,
            RecipientDirectory.bank_code == bank_code,
        )
    )
    if entry is None:
        db.add(
            RecipientDirectory(
                account_number=account_number,
                bank_code=bank_code,
                account_name=transaction.payee_name.strip(),
                source="completed_transfer",
                is_active=True,
            )
        )
    elif not entry.is_active:
        entry.is_active = True


def _warning_content(
    level: str,
    explanation: str,
    recommendation: str,
    *,
    recent_guardian_alert: RecentGuardianAlert | None = None,
) -> tuple[str, str]:
    if recent_guardian_alert is not None:
        elapsed = guardian_alert_elapsed_label(recent_guardian_alert.age_minutes)
        return (
            "Cảnh báo sau cuộc gọi đáng ngờ",
            f"Bạn vừa nhận cảnh báo về một cuộc gọi đáng ngờ {elapsed}. Hãy kiểm tra người nhận trước khi chuyển.",
        )
    if level == RiskLevel.HIGH:
        return "Cảnh báo rủi ro cao", recommendation
    return "Cần xác minh thêm", recommendation


def _normalize_request(payload: AssessRequest) -> AssessRequest:
    return payload.model_copy(update={"bank_code": normalize_bank_name(payload.bank_code)})


def _verified_recipient_request(payload: AssessRequest, current_user: User, db: Session) -> AssessRequest:
    """Use only the name that was returned by a recent recipient lookup."""
    payload = _normalize_request(payload)
    account_number = payload.payee_account.replace(" ", "").strip()
    if not payload.bank_code:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Ngân hàng không hợp lệ")

    try:
        verified = decode_recipient_lookup_token(payload.recipient_lookup_token, user_id=str(current_user.id))
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Thông tin người nhận chưa được xác thực hoặc đã hết hạn. Vui lòng tra cứu lại.",
        ) from None

    if verified["account_number"] != account_number or verified["bank_code"] != payload.bank_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Thông tin người nhận đã thay đổi. Vui lòng tra cứu lại.",
        )
    if is_timi_bank(payload.bank_code):
        timi_recipient = find_active_timi_recipient(db, account_number)
        if timi_recipient is not None and timi_recipient.role == UserRole.ADMIN.value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Không thể chuyển tiền đến tài khoản quản trị viên.",
            )
    return payload.model_copy(update={"payee_account": account_number, "payee_name": verified["account_name"]})


def _response_from_assessment(
    transaction: Transaction,
    assessment: TransactionRiskAssessment,
    signals: list[RiskSignal],
    warning: TransactionWarning | None,
) -> AssessResponse:
    requires_face_verification = requires_transfer_face_verification(
        amount=transaction.amount,
        risk_level=assessment.risk_level,
        blacklist_match_found=assessment.blacklist_match_found,
    )
    face_verification_nonce = None
    face_verification_expires_at = None
    if requires_face_verification:
        face_challenge = (assessment.raw_result or {}).get("face_verification_challenge")
        if isinstance(face_challenge, dict):
            nonce = face_challenge.get("nonce")
            expires_at = face_challenge.get("expires_at")
            if isinstance(nonce, str) and isinstance(expires_at, str):
                try:
                    parsed_expires_at = datetime.fromisoformat(expires_at)
                except ValueError:
                    parsed_expires_at = None
                if parsed_expires_at is not None and parsed_expires_at.tzinfo is not None:
                    face_verification_nonce = nonce
                    face_verification_expires_at = parsed_expires_at

    return AssessResponse(
        transaction_id=transaction.id,
        assessment_id=assessment.id,
        risk_score=float(assessment.risk_score),
        risk_level=assessment.risk_level,
        signals=[
            RiskSignalOut(
                signal_type=signal.signal_type,
                severity=signal.severity,
                score=float(signal.score) if signal.score is not None else None,
                explanation=signal.explanation,
                evidence=signal.evidence or {},
            )
            for signal in signals
        ],
        explanation=assessment.explanation,
        recommendation=(warning.message if warning is not None else risk_rules.recommendation(assessment.risk_level)),
        should_warn=assessment.should_warn,
        requires_face_verification=requires_face_verification,
        face_verification_nonce=face_verification_nonce,
        face_verification_expires_at=face_verification_expires_at,
        warning=(
            WarningOut(
                id=warning.id,
                warning_level=warning.warning_level,
                title=warning.title,
                message=warning.message,
                transparency_reason=warning.transparency_reason,
                displayed_at=warning.displayed_at,
                countdown_seconds=warning.countdown_seconds,
            )
            if warning is not None
            else None
        ),
    )


def _persist_assessment(
    db: Session,
    transaction: Transaction,
    request: AssessRequest,
    current_user: User,
    telemetry: RiskTelemetry | None,
) -> AssessResponse:
    started = time.perf_counter()
    transaction.transaction_status = TransactionStatus.RISK_CHECKING
    db.add(transaction)
    db.flush()

    graph_result = transaction_graph.invoke(
        {
            "db": db,
            "user_id": current_user.id,
            "request": request,
            "telemetry": telemetry,
        }
    )
    candidates = graph_result["signals"]
    score, level = graph_result["risk_score"], graph_result["risk_level"]
    explanation = graph_result["explanation"]
    should_warn = level in {RiskLevel.MEDIUM, RiskLevel.HIGH}
    assessment_time = _utcnow()
    recent_guardian_alert = recent_guardian_alert_for_user(
        db,
        user_id=current_user.id,
        now=assessment_time,
    )
    active_guardian = db.scalar(
        select(ScamGuardianSession)
        .where(
            ScamGuardianSession.user_id == current_user.id,
            ScamGuardianSession.status == "active",
            ScamGuardianSession.agent_action.in_(["MONITOR", "PAUSE", "STOP"]),
        )
        .order_by(desc(ScamGuardianSession.max_risk_score))
        .limit(1)
    )
    if active_guardian is not None:
        guardian_score = active_guardian.max_risk_score / 100
        score = max(score, guardian_score)
        # The Guardian agent owns the risk threshold and action.  The
        # transaction API only translates that action into an execution
        # safeguard; it does not derive one from a numeric score.
        level = RiskLevel.MEDIUM if active_guardian.agent_action == "MONITOR" else RiskLevel.HIGH
        should_warn = active_guardian.agent_action in {"MONITOR", "PAUSE", "STOP"}
        candidates = [
            *candidates,
            risk_rules.RiskSignalCandidate(
                signal_type="active_scam_guardian",
                severity="high",
                score=guardian_score,
                explanation=(
                    "Timi đang cảnh báo về một cuộc gọi có dấu hiệu đáng ngờ. "
                    "Hãy kiểm tra lại người nhận trước khi chuyển."
                ),
                evidence={
                    "session_id": str(active_guardian.id),
                    "risk_score": active_guardian.max_risk_score,
                    "agent_action": active_guardian.agent_action,
                },
            ),
        ]
        explanation = risk_rules.build_explanation(level, candidates)

    # A Guardian STOP alert remains relevant for a short, explicit window
    # after the call ends.  It is a risk signal—not a transfer block—and
    # deliberately has no transcript content.  The user can still decide
    # after the usual warning review and independent verification.
    if recent_guardian_alert is not None and (
        active_guardian is None or active_guardian.id != recent_guardian_alert.session_id
    ):
        guardian_score = min(
            1.0,
            max(0.75, recent_guardian_alert.risk_score / 100),
        )
        elapsed = guardian_alert_elapsed_label(recent_guardian_alert.age_minutes)
        score = max(score, guardian_score)
        level = RiskLevel.HIGH
        should_warn = True
        candidates = [
            *candidates,
            risk_rules.RiskSignalCandidate(
                signal_type="recent_scam_guardian_alert",
                severity="high",
                score=guardian_score,
                explanation=(
                    f"Bạn vừa nhận cảnh báo về một cuộc gọi đáng ngờ {elapsed}. "
                    "Nếu giao dịch này liên quan đến cuộc gọi đó, hãy kiểm tra lại người nhận."
                ),
                evidence={
                    "alert_id": str(recent_guardian_alert.alert_id),
                    "session_id": str(recent_guardian_alert.session_id),
                    "alerted_at": recent_guardian_alert.alerted_at.isoformat(),
                    "age_minutes": recent_guardian_alert.age_minutes,
                    "agent_action": recent_guardian_alert.action,
                },
            ),
        ]
        # Rebuild from the final candidates instead of appending the old
        # no-risk fallback ("không phát hiện ... rule") to a real Guardian
        # warning. The resulting modal reason stays short and user-facing.
        explanation = risk_rules.build_explanation(level, candidates)

    requires_face_verification = requires_transfer_face_verification(
        amount=transaction.amount,
        risk_level=level,
        blacklist_match_found=any(signal.signal_type == "blacklist_exact_match" for signal in candidates),
    )
    face_verification_challenge = (
        {
            "nonce": uuid.uuid4().hex,
            "expires_at": (_utcnow() + timedelta(minutes=3)).isoformat(),
        }
        if requires_face_verification
        else None
    )
    assessment = TransactionRiskAssessment(
        transaction_id=transaction.id,
        risk_score=score,
        risk_level=level,
        should_warn=should_warn,
        rules_version=risk_rules.RULES_VERSION,
        blacklist_match_found=any(signal.signal_type == "blacklist_exact_match" for signal in candidates),
        explanation=explanation,
        raw_result={
            "engine": "deterministic_rules",
            "signal_types": [signal.signal_type for signal in candidates],
            "agent": "langgraph",
            "llm_used": graph_result.get("llm_used", False),
            "prompt_injection_detected": graph_result.get("prompt_injection_detected", False),
            "active_scam_guardian": (
                {
                    "session_id": str(active_guardian.id),
                    "risk_score": active_guardian.max_risk_score,
                    "agent_action": active_guardian.agent_action,
                }
                if active_guardian is not None
                else None
            ),
            "recent_scam_guardian_alert": (
                {
                    "alert_id": str(recent_guardian_alert.alert_id),
                    "session_id": str(recent_guardian_alert.session_id),
                    "alerted_at": recent_guardian_alert.alerted_at.isoformat(),
                    "age_minutes": recent_guardian_alert.age_minutes,
                    "agent_action": recent_guardian_alert.action,
                }
                if recent_guardian_alert is not None
                else None
            ),
            "telemetry": {
                "device_context_available": bool(telemetry and telemetry.device_hash),
                "network_context_available": bool(telemetry and telemetry.ip_hash),
                "coarse_location_opted_in": bool(telemetry and telemetry.has_location),
            },
            "face_verification_challenge": face_verification_challenge,
        },
        latency_ms=round((time.perf_counter() - started) * 1000),
    )
    db.add(assessment)
    db.flush()
    persist_risk_telemetry(
        db,
        user_id=current_user.id,
        transaction_id=transaction.id,
        telemetry=telemetry,
    )

    persisted_signals: list[RiskSignal] = []
    for candidate in candidates:
        signal = RiskSignal(
            assessment_id=assessment.id,
            signal_type=candidate.signal_type,
            severity=candidate.severity,
            score=candidate.score,
            explanation=candidate.explanation,
            matched_blacklist_id=candidate.matched_blacklist_id,
            matched_pattern_id=candidate.matched_pattern_id,
            evidence=candidate.evidence,
        )
        db.add(signal)
        persisted_signals.append(signal)

    warning: TransactionWarning | None = None
    if should_warn:
        title, message = _warning_content(
            level,
            explanation,
            risk_rules.recommendation(level),
            recent_guardian_alert=recent_guardian_alert,
        )
        warning = TransactionWarning(
            transaction_id=transaction.id,
            assessment_id=assessment.id,
            warning_level=level,
            title=title,
            message=message,
            transparency_reason=explanation,
            displayed_at=_utcnow(),
            countdown_seconds=30,
        )
        db.add(warning)

    transaction.transaction_status = TransactionStatus.AWAITING_DECISION
    add_audit_log(
        db,
        action="transaction.assessed",
        actor_id=current_user.id,
        resource_type="transaction",
        resource_id=transaction.id,
        metadata={
            "assessment_id": str(assessment.id),
            "risk_level": level,
            "risk_score": score,
            "should_warn": should_warn,
        },
    )
    if warning is not None:
        add_audit_log(
            db,
            action="transaction.warning_created",
            actor_id=current_user.id,
            resource_type="transaction_warning",
            resource_id=warning.id,
            metadata={"transaction_id": str(transaction.id), "warning_level": level},
        )

    db.commit()
    # A single alert never blacklists an account. Promotion requires consensus.
    promote_blacklist_if_eligible(db, transaction.payee_account, transaction.bank_code, current_user.id)
    db.commit()
    db.refresh(assessment)
    if warning is not None:
        db.refresh(warning)
    for signal in persisted_signals:
        db.refresh(signal)
    return _response_from_assessment(transaction, assessment, persisted_signals, warning)


@router.post("/assess", response_model=AssessResponse, status_code=status.HTTP_201_CREATED)
def assess(
    payload: AssessRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Create a sandbox transaction and store its first risk assessment."""
    payload = _verified_recipient_request(payload, current_user, db)
    transaction = Transaction(
        user_id=current_user.id,
        payee_account=payload.payee_account.replace(" ", "").strip(),
        payee_name=payload.payee_name.strip(),
        bank_code=payload.bank_code.strip() if payload.bank_code else None,
        amount=payload.amount,
        note=payload.note.strip() if payload.note else None,
        currency=payload.currency.upper(),
        environment=TransactionEnvironment.SANDBOX,
    )
    telemetry = build_risk_telemetry(payload.client_context, client_ip=_request_peer_ip(request))
    return _persist_assessment(db, transaction, payload, current_user, telemetry)


@router.post("/{transaction_id}/reassess", response_model=AssessResponse)
def reassess(
    transaction_id: uuid.UUID,
    payload: AssessRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssessResponse:
    """Append a new assessment when rules/model inputs need to be re-evaluated."""
    payload = _verified_recipient_request(payload, current_user, db)
    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch")
    if transaction.transaction_status not in {
        TransactionStatus.DRAFT,
        TransactionStatus.AWAITING_DECISION,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Chỉ có thể đánh giá lại giao dịch đang chờ quyết định",
        )

    transaction.payee_account = payload.payee_account.replace(" ", "").strip()
    transaction.payee_name = payload.payee_name.strip()
    transaction.bank_code = payload.bank_code.strip() if payload.bank_code else None
    transaction.amount = payload.amount
    transaction.note = payload.note.strip() if payload.note else None
    transaction.currency = payload.currency.upper()
    telemetry = build_risk_telemetry(payload.client_context, client_ip=_request_peer_ip(request))
    return _persist_assessment(db, transaction, payload, current_user, telemetry)


@router.post("/{transaction_id}/intervention", response_model=InterventionOut)
def intervention(
    transaction_id: uuid.UUID,
    payload: InterventionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterventionOut:
    """Run one persisted HITL conversation turn before the final decision.

    The agent can guide and record verification, but it cannot transfer money.
    The existing ``/{transaction_id}/decision`` endpoint remains the only
    endpoint that completes a transfer.
    """
    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    if transaction.transaction_status != TransactionStatus.AWAITING_DECISION:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Transaction is not awaiting a decision")

    started = time.perf_counter()
    try:
        result = intervention_graph.invoke(
            {
                "db": db,
                "transaction_id": transaction_id,
                "action": payload.action,
                "response": payload.response,
            }
        )
    except Exception as exc:
        record_agent_call(
            "intervention_agent",
            latency_ms=(time.perf_counter() - started) * 1000,
            success=False,
            operation="intervention_turn",
            failure_type=type(exc).__name__,
        )
        raise
    record_agent_call(
        "intervention_agent",
        latency_ms=(time.perf_counter() - started) * 1000,
        success=True,
        operation="intervention_turn",
    )

    if payload.action == "trust_recipient":
        trusted = db.scalar(
            select(TrustedRecipient).where(
                TrustedRecipient.user_id == current_user.id,
                TrustedRecipient.account_number == transaction.payee_account,
                TrustedRecipient.bank_code == transaction.bank_code,
            )
        )
        if trusted is None:
            db.add(
                TrustedRecipient(
                    user_id=current_user.id,
                    account_number=transaction.payee_account,
                    recipient_name=transaction.payee_name,
                    bank_code=transaction.bank_code,
                    trusted_at=_utcnow(),
                )
            )
            add_audit_log(
                db,
                action="trusted_recipient.created_from_intervention",
                actor_id=current_user.id,
                resource_type="transaction",
                resource_id=transaction.id,
            )
            db.commit()

    if payload.action == "cancel":
        now = _utcnow()
        transaction.transaction_status = TransactionStatus.CANCELLED
        transaction.cancelled_at = now
        add_audit_log(
            db,
            action="transaction.cancelled_from_intervention",
            actor_id=current_user.id,
            resource_type="transaction",
            resource_id=transaction.id,
        )
        db.commit()

    warning = result.get("warning")
    return InterventionOut(
        transaction_id=transaction.id,
        warning_id=warning.id if warning else None,
        step=result["step"],
        total_steps=4,
        node_name=result["node_name"],
        message=result["message"],
        question=result.get("question"),
        suggested_actions=result.get("suggested_actions", []),
        risk_factors=result.get("risk_factors", []),
        decision_ready=result.get("decision_ready", False),
        can_proceed=result.get("can_proceed", False),
    )


@router.post("/{transaction_id}/scam-report", response_model=ScamReportOut, status_code=status.HTTP_201_CREATED)
def create_scam_report(
    transaction_id: uuid.UUID,
    payload: ScamReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScamReport:
    """Store user feedback as reviewable evidence; never auto-blacklist once."""
    transaction = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == current_user.id,
        )
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    report = ScamReport(
        user_id=current_user.id,
        transaction_id=transaction.id,
        report_type=payload.report_type,
        description=payload.description,
    )
    db.add(report)
    db.flush()
    add_audit_log(
        db,
        action="scam_report.created",
        actor_id=current_user.id,
        resource_type="scam_report",
        resource_id=report.id,
        metadata={"report_type": payload.report_type},
    )
    db.commit()
    db.refresh(report)
    return report


@router.post("/{transaction_id}/decision", response_model=DecisionResponse)
def submit_decision(
    transaction_id: uuid.UUID,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DecisionResponse:
    """Record the human decision; the server enforces warning countdowns."""
    started = time.perf_counter()
    transaction = db.scalar(
        select(Transaction)
        .where(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .with_for_update()
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch")
    if transaction.transaction_status != TransactionStatus.AWAITING_DECISION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Giao dịch này đã được xử lý hoặc không còn chờ quyết định",
        )

    active_guardian = db.scalar(
        select(ScamGuardianSession)
        .where(
            ScamGuardianSession.user_id == current_user.id,
            ScamGuardianSession.status == "active",
            or_(
                ScamGuardianSession.agent_action == "STOP",
                # A degraded agent is not a scam verdict, but transfers must
                # still wait until a trusted risk decision is available.
                ScamGuardianSession.scam_type == "agent_unavailable",
            ),
        )
        .order_by(desc(ScamGuardianSession.max_risk_score))
        .limit(1)
    )
    if active_guardian is not None and payload.decision == WarningDecision.PROCEEDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Giao dịch bị tạm chặn vì Scam Guardian chưa có quyết định tin cậy "
                f"(action={active_guardian.agent_action}, "
                f"risk={active_guardian.max_risk_score}/100). "
                "Hãy kết thúc cuộc gọi hoặc thử lại khi Guardian hoạt động ổn định."
            ),
        )

    warning = db.scalar(
        select(TransactionWarning)
        .where(TransactionWarning.transaction_id == transaction.id)
        .order_by(desc(TransactionWarning.displayed_at))
        .limit(1)
    )
    now = _utcnow()
    requires_face_verification = False
    timi_recipient: User | None = None

    if warning is not None:
        if payload.decision == WarningDecision.PROCEEDED:
            available_at = warning.displayed_at + timedelta(seconds=warning.countdown_seconds)
            if now < available_at:
                remaining = max(1, int((available_at - now).total_seconds()))
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Vui lòng chờ hết thời gian cảnh báo ({remaining} giây)",
                )
            if payload.verification_confirmed is not True:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Bạn cần xác nhận đã kiểm tra lại thông tin trước khi tiếp tục",
                )
        warning.user_decision = payload.decision
        warning.verification_confirmed = payload.verification_confirmed
        warning.verification_method = payload.verification_method
        warning.decided_at = now

    if payload.decision == WarningDecision.CANCELLED:
        transaction.transaction_status = TransactionStatus.CANCELLED
        transaction.cancelled_at = now
        action = "transaction.cancelled"
    else:
        latest_assessment = db.scalar(
            select(TransactionRiskAssessment)
            .where(TransactionRiskAssessment.transaction_id == transaction.id)
            .order_by(desc(TransactionRiskAssessment.created_at))
            .limit(1)
        )
        requires_face_verification = requires_transfer_face_verification(
            amount=transaction.amount,
            risk_level=latest_assessment.risk_level if latest_assessment else None,
            blacklist_match_found=bool(latest_assessment and latest_assessment.blacklist_match_found),
        )
        if requires_face_verification:
            face_challenge = ((latest_assessment.raw_result if latest_assessment else {}) or {}).get(
                "face_verification_challenge"
            )
            challenge_nonce = face_challenge.get("nonce") if isinstance(face_challenge, dict) else None
            challenge_expires_at = face_challenge.get("expires_at") if isinstance(face_challenge, dict) else None
            try:
                parsed_challenge_expiry = (
                    datetime.fromisoformat(challenge_expires_at) if isinstance(challenge_expires_at, str) else None
                )
            except ValueError:
                parsed_challenge_expiry = None
            if (
                not isinstance(challenge_nonce, str)
                or parsed_challenge_expiry is None
                or parsed_challenge_expiry.tzinfo is None
                or now >= parsed_challenge_expiry
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Phiên xác thực khuôn mặt đã hết hạn. Vui lòng kiểm tra lại giao dịch.",
                )
            if not payload.face_verification_token:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Giao dịch này phải được xác thực khuôn mặt trước khi hoàn tất.",
                )
            try:
                decode_face_verification_token(
                    payload.face_verification_token,
                    user_id=str(current_user.id),
                    transaction_id=str(transaction.id),
                    nonce=challenge_nonce,
                    amount=transaction.amount,
                )
            except (JWTError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Xác thực khuôn mặt không hợp lệ hoặc đã hết hạn.",
                ) from None
        is_internal_timi_transfer = is_timi_bank(transaction.bank_code)
        if not is_internal_timi_transfer:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Chuyển liên ngân hàng chưa khả dụng vì chưa tích hợp cổng quyết toán thật. "
                    "Bạn vẫn có thể chuyển nội bộ Timi Bank."
                ),
            )
        try:
            locked_user, timi_recipient = lock_timi_transfer_parties(
                db,
                sender_user_id=current_user.id,
                recipient_account_number=transaction.payee_account,
            )
        except TimiSelfTransfer as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        except TimiTransferError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        daily_limit = MAX_DAILY_OUTGOING_VND
        if _completed_outgoing_today(db, current_user.id) + transaction.amount > daily_limit:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Giao dịch vượt hạn mức chuyển tiền {daily_limit:,} đ mỗi ngày.",
            )
        if not requires_face_verification and (locked_user is None or not locked_user.transaction_pin_hash):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bạn chưa thiết lập mã PIN giao dịch. Hãy thiết lập PIN trước khi chuyển tiền.",
            )
        if not requires_face_verification:
            remaining = lock_remaining_seconds(locked_user, "pin")
            if remaining:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    headers={"Retry-After": str(remaining)},
                    detail=f"Mã PIN đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
                )
            if not payload.pin or not verify_password(payload.pin, locked_user.transaction_pin_hash):
                # Discard warning/transaction mutations before persisting only
                # the credential failure state in a fresh transaction.
                db.rollback()
                locked_user = db.scalar(select(User).where(User.id == current_user.id).with_for_update())
                if locked_user is None:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Tài khoản không khả dụng",
                    )
                settings = get_settings()
                locked_for = record_failure(
                    locked_user,
                    "pin",
                    failure_limit=settings.pin_failure_limit,
                    lock_seconds=settings.pin_lock_seconds,
                )
                db.commit()
                if locked_for:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        headers={"Retry-After": str(locked_for)},
                        detail=f"Nhập sai PIN quá nhiều lần. PIN tạm khóa {locked_for} giây.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Mã PIN giao dịch không đúng.",
                )
            clear_failures(locked_user, "pin")
        if locked_user is None or locked_user.balance < transaction.amount:
            transaction.transaction_status = TransactionStatus.FAILED
            add_in_app_notification(
                db,
                user_id=current_user.id,
                title="Giao dịch không thành công",
                body="Số dư Timi không đủ để hoàn tất giao dịch này.",
                kind="transaction",
            )
            add_audit_log(
                db,
                action="transaction.failed_insufficient_balance",
                actor_id=current_user.id,
                resource_type="transaction",
                resource_id=transaction.id,
                metadata={"amount": transaction.amount},
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Số dư không đủ")
        transaction.transaction_status = TransactionStatus.PROCESSING
        try:
            apply_timi_transfer(
                db,
                transaction=transaction,
                sender=locked_user,
                recipient=timi_recipient,
            )
        except InsufficientTimiBalance:
            # The precheck above normally catches this. Keeping the domain
            # check here makes the service safe if this block is reused.
            transaction.transaction_status = TransactionStatus.FAILED
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Số dư không đủ") from None
        transaction.transaction_status = TransactionStatus.COMPLETED
        transaction.completed_at = now
        _sync_completed_recipient(db, transaction)
        action = "transaction.proceeded"

    amount_text = f"{transaction.amount:,}".replace(",", ".") + " đ"
    if transaction.transaction_status == TransactionStatus.CANCELLED:
        add_in_app_notification(
            db,
            user_id=current_user.id,
            title="Giao dịch đã hủy",
            body=f"Bạn đã hủy giao dịch {amount_text} tới {transaction.payee_name}.",
            kind="transaction",
        )
    elif transaction.transaction_status == TransactionStatus.COMPLETED:
        add_in_app_notification(
            db,
            user_id=current_user.id,
            title="Chuyển tiền hoàn tất",
            body=f"Đã chuyển {amount_text} tới {transaction.payee_name}.",
            kind="transaction",
        )
        if timi_recipient is not None:
            add_in_app_notification(
                db,
                user_id=timi_recipient.id,
                title="Bạn vừa nhận tiền",
                body=f"Bạn đã nhận {amount_text} từ {current_user.full_name}.",
                kind="transaction",
            )

    if warning is not None:
        # Lưu dấu vết HITL riêng, không đưa câu trả lời vào audit log/front-end logs.
        from src.app.models.intervention_log import InterventionLog

        db.add(
            InterventionLog(
                transaction_id=transaction.id,
                warning_id=warning.id,
                node_name="user_decision",
                user_response="\n".join(payload.verification_answers) or None,
                suggested_actions=risk_rules.verification_questions(warning.warning_level),
            )
        )

    add_audit_log(
        db,
        action=action,
        actor_id=current_user.id,
        resource_type="transaction",
        resource_id=transaction.id,
        metadata={
            "warning_id": str(warning.id) if warning is not None else None,
            "decision": payload.decision,
            "pin_verified": payload.decision == WarningDecision.PROCEEDED and not requires_face_verification,
            "face_verified": payload.decision == WarningDecision.PROCEEDED and requires_face_verification,
            "internal_timi_transfer": payload.decision == WarningDecision.PROCEEDED
            and is_timi_bank(transaction.bank_code),
            "external_settlement": False,
        },
    )
    db.commit()
    if warning is not None:
        # A warning decision is the user-facing intervention turn. Count it
        # even when the user cancels directly from the warning modal, because
        # that path persists an InterventionLog without calling the graph
        # endpoint first.
        record_agent_call(
            "intervention_agent",
            latency_ms=(time.perf_counter() - started) * 1000,
            success=True,
            operation="warning_decision",
        )
    return DecisionResponse(
        transaction_id=transaction.id,
        transaction_status=transaction.transaction_status,
        warning_id=warning.id if warning is not None else None,
        decided_at=now,
    )


def _encode_history_cursor(transaction: Transaction) -> str:
    payload = {
        "created_at": transaction.created_at.astimezone(UTC).isoformat(),
        "id": str(transaction.id),
    }
    secret = get_settings().history_cursor_secret or get_settings().jwt_secret_key
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key).encrypt(json.dumps(payload, separators=(",", ":")).encode("utf-8")).decode("ascii")


def _decode_history_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        secret = get_settings().history_cursor_secret or get_settings().jwt_secret_key
        key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
        payload = json.loads(Fernet(key).decrypt(cursor.encode("ascii")).decode("utf-8"))
        created_at = datetime.fromisoformat(payload["created_at"])
        transaction_id = uuid.UUID(payload["id"])
        if created_at.tzinfo is None:
            raise ValueError("cursor timestamp has no timezone")
        return created_at.astimezone(UTC), transaction_id
    except (InvalidToken, KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Cursor lịch sử giao dịch không hợp lệ") from None


def _history_item(
    transaction: Transaction,
    sender_user: User | None,
    risk_level: str | None,
    risk_reason: str | None,
    *,
    current_user_id: uuid.UUID,
) -> dict[str, object]:
    is_incoming_timi_transfer = transaction.timi_recipient_user_id == current_user_id
    return {
        "id": transaction.id,
        "payee_account": transaction.payee_account,
        "payee_name": transaction.payee_name,
        # Kept for compatibility with older clients. New clients should use
        # counterparty_* because it works for both directions.
        "direction": "incoming" if is_incoming_timi_transfer else "outgoing",
        "counterparty_name": (
            sender_user.full_name if is_incoming_timi_transfer and sender_user is not None else transaction.payee_name
        ),
        "counterparty_account": (
            sender_user.phone if is_incoming_timi_transfer and sender_user is not None else transaction.payee_account
        ),
        "bank_code": transaction.bank_code,
        "amount": transaction.amount,
        "currency": transaction.currency,
        "note": transaction.note,
        "transaction_status": transaction.transaction_status,
        "created_at": transaction.created_at,
        "completed_at": transaction.completed_at,
        "cancelled_at": transaction.cancelled_at,
        "risk_level": risk_level,
        "risk_reason": risk_reason,
    }


@router.get("/history/summary", response_model=TransactionHistorySummary)
def history_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionHistorySummary:
    """Small indexed aggregate used for the transfer page's daily limit."""
    completed_outgoing_today = _completed_outgoing_today(db, current_user.id)
    daily_limit = MAX_DAILY_OUTGOING_VND
    total_transactions = db.scalar(
        select(func.count(Transaction.id)).where(
            or_(
                Transaction.user_id == current_user.id,
                Transaction.timi_recipient_user_id == current_user.id,
            )
        )
    )
    return TransactionHistorySummary(
        completed_outgoing_today=completed_outgoing_today,
        daily_limit=daily_limit,
        remaining_daily_limit=max(0, daily_limit - completed_outgoing_today),
        total_transactions=int(total_transactions or 0),
    )


@router.get("/security-summary")
def security_summary(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """Return non-sensitive aggregate metrics across the Timi platform."""
    total_users = db.scalar(select(func.count(User.id)).where(User.role == UserRole.USER.value)) or 0
    total_transactions = db.scalar(select(func.count(Transaction.id))) or 0
    total_completed_volume = (
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.transaction_status == TransactionStatus.COMPLETED
            )
        )
        or 0
    )
    blocked_transactions = (
        db.scalar(
            select(func.count(func.distinct(Transaction.id)))
            .join(
                TransactionRiskAssessment,
                TransactionRiskAssessment.transaction_id == Transaction.id,
            )
            .where(
                TransactionRiskAssessment.risk_level == RiskLevel.HIGH,
                Transaction.transaction_status.in_(
                    [
                        TransactionStatus.CANCELLED,
                        TransactionStatus.FAILED,
                    ]
                ),
            )
        )
        or 0
    )
    return {
        "total_users": int(total_users),
        "total_transactions": int(total_transactions),
        "total_completed_volume": int(total_completed_volume),
        "blocked_transactions": int(blocked_transactions),
    }


@router.get("/recent-contacts")
def recent_contacts(
    limit: int = Query(default=8, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict[str, object]]:
    """Return completed outgoing recipients for the transfer form.

    A recipient remains selectable after a completed transfer even when the
    original assessment was high risk: selecting it starts a fresh lookup and
    risk assessment for the new transfer. Administrator accounts are never
    listed as transfer recipients.
    """
    page_size = limit
    recipient = aliased(User)

    rows = db.execute(
        select(Transaction, recipient)
        .outerjoin(recipient, Transaction.timi_recipient_user_id == recipient.id)
        .where(
            Transaction.user_id == current_user.id,
            Transaction.transaction_status == TransactionStatus.COMPLETED,
        )
        .order_by(desc(Transaction.created_at), desc(Transaction.id))
        .limit(50)
    ).all()

    account_numbers = {transaction.payee_account.replace(" ", "").strip() for transaction, _recipient_user in rows}
    blacklist_entries = (
        db.scalars(
            select(Blacklist).where(
                Blacklist.entity_type == "account",
                Blacklist.entity_value.in_(account_numbers),
                Blacklist.is_active.is_(True),
            )
        ).all()
        if account_numbers
        else []
    )
    blacklisted_accounts = {
        (
            entry.entity_value.replace(" ", "").strip(),
            normalize_bank_name(entry.bank),
        )
        for entry in blacklist_entries
    }

    contacts: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    own_phone = (current_user.phone or "").replace(" ", "").strip()
    own_name = current_user.full_name.strip().casefold()
    for transaction, recipient_user in rows:
        account = transaction.payee_account.replace(" ", "").strip()
        bank_code = transaction.bank_code or ""
        if (account, normalize_bank_name(bank_code)) in blacklisted_accounts:
            continue
        if recipient_user and recipient_user.role == UserRole.ADMIN.value:
            continue
        recipient_name = (recipient_user.full_name if recipient_user else transaction.payee_name).strip()
        if (
            (recipient_user and recipient_user.id == current_user.id)
            or (own_phone and account == own_phone)
            or (recipient_name and recipient_name.casefold() == own_name)
        ):
            continue
        key = (account, bank_code)
        if not account or key in seen:
            continue
        seen.add(key)
        contacts.append(
            {
                "id": str(recipient_user.id if recipient_user else transaction.id),
                "full_name": recipient_name,
                "account_number": account,
                "bank_code": bank_code,
                "role": recipient_user.role if recipient_user else None,
                "avatar_url": recipient_user.avatar_url if recipient_user else None,
                "last_transferred_at": transaction.created_at,
            }
        )
        if len(contacts) >= page_size:
            break
    return contacts


@router.get("/saved-recipients", response_model=list[SavedRecipientOut])
def saved_recipients(
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SavedRecipientOut]:
    """Return only the current user's saved transfer addresses.

    This is an address book, not a security allow-list. The frontend still
    performs a recipient lookup and risk assessment after selection.
    """
    page_size = limit
    recipients = list(
        db.scalars(
            select(SavedRecipient)
            .where(SavedRecipient.user_id == current_user.id)
            .order_by(desc(SavedRecipient.saved_at), desc(SavedRecipient.id))
            .limit(page_size)
        ).all()
    )
    return _saved_recipient_outputs(db, recipients)


@router.get("/history", response_model=TransactionHistoryPage)
def history(
    limit: int = Query(default=_HISTORY_DEFAULT_PAGE_SIZE, ge=1, le=_HISTORY_MAX_PAGE_SIZE),
    cursor: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionHistoryPage:
    """Read a stable transaction page without offset scans or N+1 queries."""
    page_size = limit
    seek_created_at: datetime | None = None
    seek_transaction_id: uuid.UUID | None = None
    if cursor:
        seek_created_at, seek_transaction_id = _decode_history_cursor(cursor)

    seek_filter = (
        or_(
            Transaction.created_at < seek_created_at,
            and_(
                Transaction.created_at == seek_created_at,
                Transaction.id < seek_transaction_id,
            ),
        )
        if seek_created_at is not None and seek_transaction_id is not None
        else None
    )
    outgoing = select(Transaction.id.label("transaction_id")).where(Transaction.user_id == current_user.id)
    incoming = select(Transaction.id.label("transaction_id")).where(
        Transaction.timi_recipient_user_id == current_user.id
    )
    if seek_filter is not None:
        outgoing = outgoing.where(seek_filter)
        incoming = incoming.where(seek_filter)
    visible_transactions = union_all(outgoing, incoming).subquery("visible_transactions")

    sender = aliased(User)
    latest_assessment = lateral(
        select(
            TransactionRiskAssessment.risk_level.label("risk_level"),
            TransactionRiskAssessment.explanation.label("risk_reason"),
        )
        .where(TransactionRiskAssessment.transaction_id == Transaction.id)
        .order_by(desc(TransactionRiskAssessment.created_at))
        .limit(1)
    ).alias("latest_assessment")
    rows = db.execute(
        select(
            Transaction,
            sender,
            latest_assessment.c.risk_level,
            latest_assessment.c.risk_reason,
        )
        .join(visible_transactions, visible_transactions.c.transaction_id == Transaction.id)
        .outerjoin(sender, Transaction.user_id == sender.id)
        .outerjoin(latest_assessment, true())
        .order_by(desc(Transaction.created_at), desc(Transaction.id))
        .limit(page_size + 1)
    ).all()
    has_next_page = len(rows) > page_size
    page_rows = rows[:page_size]
    return TransactionHistoryPage(
        items=[
            _history_item(
                transaction,
                sender_user,
                risk_level,
                risk_reason,
                current_user_id=current_user.id,
            )
            for transaction, sender_user, risk_level, risk_reason in page_rows
        ],
        next_cursor=(_encode_history_cursor(page_rows[-1][0]) if has_next_page and page_rows else None),
    )


@router.post("/trusted-recipients", status_code=status.HTTP_201_CREATED)
def mark_trusted_recipient(
    payload: TrustedRecipientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    account_number = payload.account_number.replace(" ", "").strip()
    bank_code = normalize_bank_name(payload.bank_code)
    existing = db.scalar(
        select(TrustedRecipient).where(
            TrustedRecipient.user_id == current_user.id,
            TrustedRecipient.account_number == account_number,
            TrustedRecipient.bank_code == bank_code,
        )
    )
    if existing is not None:
        return {"status": "already_trusted", "recipient_id": str(existing.id)}

    recipient = TrustedRecipient(
        user_id=current_user.id,
        account_number=account_number,
        recipient_name=payload.recipient_name.strip(),
        bank_code=bank_code,
        trusted_at=_utcnow(),
    )
    db.add(recipient)
    add_audit_log(
        db,
        action="trusted_recipient.created",
        actor_id=current_user.id,
        resource_type="trusted_recipient",
        resource_id=recipient.id,
    )
    db.commit()
    return {"status": "trusted", "recipient_id": str(recipient.id)}


@router.post("/saved-recipients", response_model=SavedRecipientOut, status_code=status.HTTP_201_CREATED)
def save_recipient(
    payload: SavedRecipientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedRecipientOut:
    """Save a recipient that has just been resolved by the server.

    The signed lookup token prevents a browser from saving a made-up name or
    from marking an arbitrary account as safe. Saving has no effect on risk
    scoring; it only powers the personal recipient picker.
    """
    account_number = payload.account_number.replace(" ", "").strip()
    bank_code = normalize_bank_name(payload.bank_code)
    if not bank_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Ngân hàng không hợp lệ",
        )
    try:
        verified = decode_recipient_lookup_token(payload.recipient_lookup_token, user_id=str(current_user.id))
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Thông tin người nhận chưa được xác thực hoặc đã hết hạn. Vui lòng tra cứu lại.",
        ) from None
    if verified["account_number"] != account_number or verified["bank_code"] != bank_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Thông tin người nhận đã thay đổi. Vui lòng tra cứu lại.",
        )

    recipient = db.scalar(
        select(SavedRecipient).where(
            SavedRecipient.user_id == current_user.id,
            SavedRecipient.account_number == account_number,
            SavedRecipient.bank_code == bank_code,
        )
    )
    if recipient is not None:
        return _saved_recipient_outputs(db, [recipient])[0]

    recipient = SavedRecipient(
        user_id=current_user.id,
        account_number=account_number,
        recipient_name=verified["account_name"],
        bank_code=bank_code,
        saved_at=_utcnow(),
    )
    db.add(recipient)
    db.flush()
    add_audit_log(
        db,
        action="saved_recipient.created",
        actor_id=current_user.id,
        resource_type="saved_recipient",
        resource_id=recipient.id,
    )
    db.commit()
    db.refresh(recipient)
    return _saved_recipient_outputs(db, [recipient])[0]


@router.delete("/saved-recipients/{recipient_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_recipient(
    recipient_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    recipient = db.scalar(
        select(SavedRecipient).where(
            SavedRecipient.id == recipient_id,
            SavedRecipient.user_id == current_user.id,
        )
    )
    if recipient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người nhận đã lưu")
    db.delete(recipient)
    add_audit_log(
        db,
        action="saved_recipient.deleted",
        actor_id=current_user.id,
        resource_type="saved_recipient",
        resource_id=recipient_id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/warnings/{warning_id}/feedback", status_code=status.HTTP_201_CREATED)
def create_warning_feedback(
    warning_id: uuid.UUID,
    payload: WarningFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    warning = db.scalar(
        select(TransactionWarning)
        .join(Transaction)
        .where(TransactionWarning.id == warning_id, Transaction.user_id == current_user.id)
    )
    if warning is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cảnh báo")
    if warning.feedback is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cảnh báo đã có phản hồi")

    feedback = WarningFeedback(
        warning_id=warning.id,
        user_id=current_user.id,
        feedback_type=payload.feedback_type,
        comment=payload.comment,
    )
    db.add(feedback)
    db.flush()
    promote_blacklist_if_eligible(db, warning.transaction.payee_account, warning.transaction.bank_code, current_user.id)
    add_audit_log(
        db,
        action="transaction_warning.feedback_created",
        actor_id=current_user.id,
        resource_type="transaction_warning",
        resource_id=warning.id,
        metadata={"feedback_type": payload.feedback_type},
    )
    db.commit()
    return {"status": "created", "feedback_id": str(feedback.id)}


@router.get("/{transaction_id}", response_model=TransactionOut)
def transaction_detail(
    transaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    """Return one transaction only to its sender or internal Timi recipient."""
    transaction = db.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy giao dịch",
        )
    if current_user.id not in {
        transaction.user_id,
        transaction.timi_recipient_user_id,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem giao dịch này",
        )

    latest_assessment = db.scalar(
        select(TransactionRiskAssessment)
        .where(TransactionRiskAssessment.transaction_id == transaction.id)
        .order_by(desc(TransactionRiskAssessment.created_at))
        .limit(1)
    )
    sender_user = db.get(User, transaction.user_id) if transaction.timi_recipient_user_id == current_user.id else None
    return _history_item(
        transaction,
        sender_user,
        latest_assessment.risk_level if latest_assessment else None,
        latest_assessment.explanation if latest_assessment else None,
        current_user_id=current_user.id,
    )
