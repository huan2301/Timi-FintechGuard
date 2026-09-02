from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.security import get_current_user
from ..database import get_db
from ..models import Transaction, User
from ..schemas import (
    InterventionResponse,
    RiskAnalysis,
    TransactionCreate,
    TransactionDecision,
    TransactionResponse,
)
from ..services.email_service import send_security_email, send_transaction_email
from ..services.llm_agent import InterventionAgent
from ..services.risk_engine import RiskEngine

router = APIRouter(prefix="/api/v1/transactions", tags=["Transactions"])


def log_audit(
    db: Session,
    resource_type: str,
    resource_id: Any,
    action: str,
    before: Any,
    after: Any,
    actor_id: Any,
) -> None:
    """Placeholder — thay bằng service audit thật nếu đã có."""
    try:
        # Nếu project đã có log_audit riêng, import và dùng lại.
        pass
    except Exception:
        pass


@router.post("/analyze", response_model=TransactionResponse)
async def analyze_transaction(
    tx_data: TransactionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 1: Phân tích rủi ro trước khi tạo giao dịch.
    Không thực hiện chuyển tiền, chỉ trả về đánh giá rủi ro.
    """
    risk_engine = RiskEngine(db)

    risk_result = await risk_engine.calculate_risk(
        user_id=current_user.id,
        recipient_account=tx_data.recipient_account,
        recipient_bank=tx_data.recipient_bank,
        amount=tx_data.amount,
        description=tx_data.description,
    )

    transaction = Transaction(
        user_id=current_user.id,
        **tx_data.model_dump(),
        ml_risk_score=risk_result.ml_score,
        rule_risk_score=risk_result.rule_score,
        final_risk_score=risk_result.final_score,
        risk_level=risk_result.level,
        agent_warning_shown=risk_result.level in ["medium", "high", "critical"],
        warning_reason=risk_result.reason,
        status="pending",
        user_decision="pending",
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    background_tasks.add_task(
        log_audit,
        db,
        "transactions",
        transaction.id,
        "INSERT",
        None,
        {"status": "pending", "risk_level": risk_result.level},
        current_user.id,
    )

    # Mail bảo mật khi rủi ro cao / critical
    if risk_result.level in ("high", "critical") and getattr(current_user, "email", None):
        background_tasks.add_task(
            send_security_email,
            to=current_user.email,
            full_name=getattr(current_user, "full_name", None) or "Bạn",
            title="Cảnh báo giao dịch rủi ro cao",
            message=(
                f"Giao dịch {transaction.id} được đánh giá mức "
                f"{risk_result.level}. "
                f"{risk_result.reason or 'Hệ thống phát hiện tín hiệu bất thường.'} "
                "Vui lòng kiểm tra kỹ trước khi xác nhận."
            ),
        )

    response = TransactionResponse.model_validate(transaction)
    response.risk_analysis = RiskAnalysis(
        ml_risk_score=float(risk_result.ml_score) if risk_result.ml_score else None,
        rule_risk_score=float(risk_result.rule_score) if risk_result.rule_score else None,
        final_risk_score=float(risk_result.final_score),
        risk_level=risk_result.level,
        warning_reason=risk_result.reason,
        matched_blacklist=risk_result.matched_blacklist,
        matched_patterns=risk_result.matched_patterns,
    )

    return response


@router.post("/{tx_id}/decide", response_model=TransactionResponse)
async def make_decision(
    tx_id: UUID,
    decision: TransactionDecision,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 2: Người dùng quyết định sau khi xem cảnh báo (HITL).
    Agent chỉ cảnh báo, KHÔNG tự động chặn.
    """
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()

    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")

    if tx.user_decision != "pending":
        raise HTTPException(status_code=400, detail="Giao dịch đã được xử lý")

    tx.user_decision = decision.decision
    tx.user_decision_at = datetime.utcnow()

    if decision.decision == "confirmed":
        # Người dùng chấp nhận rủi ro -> chuyển sang processing
        tx.status = "processing"
        # Nếu pipeline của bạn complete ngay tại đây, đổi thành "completed"
        # và gửi mail giao dịch bên dưới.
    elif decision.decision == "cancelled":
        tx.status = "rejected"
    elif decision.decision == "escalated":
        tx.status = "flagged"

    db.commit()
    db.refresh(tx)

    # --- Email sau quyết định (không chặn response) ---
    user_email = getattr(current_user, "email", None)
    full_name = getattr(current_user, "full_name", None) or "Bạn"
    payee = (
        getattr(tx, "payee_name", None)
        or getattr(tx, "recipient_name", None)
        or getattr(tx, "recipient_account", None)
        or "người nhận"
    )
    amount = int(getattr(tx, "amount", 0) or 0)

    if user_email:
        if decision.decision == "confirmed":
            # Mail giao dịch khi user xác nhận tiếp tục
            background_tasks.add_task(
                send_transaction_email,
                to=user_email,
                full_name=full_name,
                amount=amount,
                counterparty=str(payee),
                direction="out",
                status=tx.status,  # processing / completed tùy pipeline
            )
        elif decision.decision == "cancelled":
            background_tasks.add_task(
                send_security_email,
                to=user_email,
                full_name=full_name,
                title="Bạn đã hủy giao dịch để an toàn",
                message=(f"Giao dịch {tx.id} tới {payee} ({amount:,} đ) đã được hủy theo lựa chọn của bạn."),
            )

    return TransactionResponse.model_validate(tx)


@router.post("/{tx_id}/intervene", response_model=InterventionResponse)
async def intervention_step(
    tx_id: UUID,
    user_response: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bước 3: Luồng can thiệp đa bước (LangGraph) nếu rủi ro cao.
    HITL: Dừng lại chờ người dùng phản hồi từng bước.
    """
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()

    if not tx:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")

    if tx.risk_level not in ["high", "critical"]:
        raise HTTPException(status_code=400, detail="Giao dịch không cần can thiệp")

    agent = InterventionAgent(db)
    result = await agent.process_step(tx_id, user_response)

    return result
