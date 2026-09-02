"""Multi-step, human-in-the-loop intervention graph.

This graph does not move money and does not change the risk score. It only
collects user verification answers, gives evidence-based guidance and reports
when the existing decision endpoint may be used.
"""

from __future__ import annotations

import uuid
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.app.models.intervention_log import InterventionLog
from src.app.models.risk_assessment import TransactionRiskAssessment, TransactionWarning
from src.app.models.transaction import Transaction
from src.app.models.trusted_recipient import TrustedRecipient

TOTAL_STEPS = 2


class InterventionState(TypedDict, total=False):
    db: Session
    transaction_id: uuid.UUID
    action: str
    response: str | None
    transaction: Transaction
    assessment: TransactionRiskAssessment
    warning: TransactionWarning | None
    logs: list[InterventionLog]
    step: int
    node_name: str
    message: str
    question: str | None
    suggested_actions: list[str]
    risk_factors: list[str]
    decision_ready: bool
    can_proceed: bool
    trusted: bool


def _load_context(state: InterventionState) -> dict[str, Any]:
    db = state["db"]
    transaction = db.scalar(select(Transaction).where(Transaction.id == state["transaction_id"]))
    if transaction is None:
        raise ValueError("Transaction not found")
    assessment = db.scalar(
        select(TransactionRiskAssessment)
        .where(TransactionRiskAssessment.transaction_id == transaction.id)
        .order_by(desc(TransactionRiskAssessment.created_at))
        .limit(1)
    )
    if assessment is None:
        raise ValueError("Risk assessment not found")
    warning = db.scalar(
        select(TransactionWarning)
        .where(TransactionWarning.transaction_id == transaction.id)
        .order_by(desc(TransactionWarning.displayed_at))
        .limit(1)
    )
    logs = list(
        db.scalars(
            select(InterventionLog)
            .where(InterventionLog.transaction_id == transaction.id)
            .order_by(InterventionLog.step_number, InterventionLog.created_at)
        ).all()
    )
    trusted = (
        db.scalar(
            select(TrustedRecipient).where(
                TrustedRecipient.user_id == transaction.user_id,
                TrustedRecipient.account_number == transaction.payee_account,
                TrustedRecipient.bank_code == transaction.bank_code,
            )
        )
        is not None
    )
    # Never let a client-provided step skip a prior persisted interaction.
    return {
        "transaction": transaction,
        "assessment": assessment,
        "warning": warning,
        "logs": logs,
        "step": min(len(logs) + 1, TOTAL_STEPS),
        "trusted": trusted,
    }


def _guidance(state: InterventionState) -> dict[str, Any]:
    assessment = state["assessment"]
    step = state["step"]
    trusted = state.get("trusted", False)
    factors = [
        signal.explanation for signal in assessment.signals if signal.score is not None and float(signal.score) > 0
    ]
    if step == 1:
        message = "Bước 1/2: Kiểm tra đúng người nhận. Hãy đối chiếu tên, số tài khoản và ngân hàng qua nguồn độc lập."
        question = "Bạn đã xác minh trực tiếp người nhận qua một kênh độc lập chưa?"
        actions = ["verify", "cancel"]
        node = "recipient_identity"
    else:
        trust_note = (
            " Người nhận đã nằm trong danh sách tin cậy của bạn, nhưng điều đó không loại trừ tài khoản bị chiếm quyền."
            if trusted
            else ""
        )
        message = (
            "Bước 2/2: Kiểm tra kênh độc lập và áp lực. Không chuyển nếu bị thúc ép, yêu cầu giữ bí mật, phí mở khóa hoặc hứa lợi nhuận."
            + trust_note
        )
        question = "Bạn đã kiểm chứng độc lập và vẫn muốn tiếp tục chuyển tiền không?"
        actions = ["proceed", "trust_recipient", "cancel"]
        node = "final_human_decision"
    return {
        "node_name": node,
        "message": message,
        "question": question,
        "suggested_actions": actions,
        "risk_factors": factors[:5],
        "decision_ready": step >= TOTAL_STEPS,
        "can_proceed": step >= TOTAL_STEPS and not (state["action"] == "cancel"),
    }


def _persist_turn(state: InterventionState) -> dict[str, Any]:
    response = (state.get("response") or "").strip()
    # Store only the bounded answer in the intervention log. It is not used as
    # instructions and is never sent to the LLM as a system message.
    log = InterventionLog(
        transaction_id=state["transaction_id"],
        warning_id=state["warning"].id if state.get("warning") else None,
        agent_run_id=uuid.uuid4(),
        node_name=state["node_name"],
        step_number=state["step"],
        agent_message=state["message"],
        user_response=response or None,
        risk_factors=state.get("risk_factors", []),
        suggested_actions=state.get("suggested_actions", []),
    )
    state["db"].add(log)
    state["db"].commit()
    return {}


def build_intervention_graph():
    graph = StateGraph(InterventionState)
    graph.add_node("load_context", _load_context)
    graph.add_node("guidance", _guidance)
    graph.add_node("persist_turn", _persist_turn)
    graph.add_edge(START, "load_context")
    graph.add_edge("load_context", "guidance")
    graph.add_edge("guidance", "persist_turn")
    graph.add_edge("persist_turn", END)
    return graph.compile()


intervention_graph = build_intervention_graph()
