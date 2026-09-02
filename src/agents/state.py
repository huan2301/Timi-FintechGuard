from __future__ import annotations

from typing import TypedDict


class AgentState(TypedDict, total=False):
    """State schema cho LangGraph agent.

    Mỗi node đọc và ghi vào state này.
    total=False cho phép tất cả fields là optional.
    """

    # ── Chat (cũ) ──────────────────────────────────────────────────────────
    query: str
    context: str
    analysis: str
    response: str
    error: str
    metadata: dict

    # ── Transaction analysis ───────────────────────────────────────────────
    # Tên field phải khớp chính xác với TransactionRequest để tránh
    # lỗi tích hợp "state rỗng không báo lỗi rõ ràng".
    transaction: dict  # dump của TransactionRequest
    warning_level: str  # safe | suspicious | high_risk
    explanation: str  # giải thích
    risk_score: float  # 0.0 – 1.0
    matched_entry_masked: str  # thông tin đã mask (PDPA)
