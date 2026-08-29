from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AssistantChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=1200)


class AssistantTransferDraft(BaseModel):
    """Untrusted transfer prefill; account, bank, and amount are sufficient."""

    # Retained only for backwards-compatible API payloads. The Task Navigator
    # does not ask for or require this; TransferPage resolves the verified name.
    recipient_name: str | None = Field(default=None, max_length=120)
    recipient_account: str | None = Field(default=None, max_length=24)
    bank_code: str | None = Field(default=None, max_length=20)
    amount: int | None = Field(default=None, ge=1, le=999_999_999)
    note: str | None = Field(default=None, max_length=500)


class AssistantTaskState(BaseModel):
    """Browser-held state for one bounded assistant task.

    It is deliberately not an authority to perform a transaction.  The
    Transfer page still obtains a recipient proof and requires the user to
    complete risk review and PIN/Face ID confirmation.
    """

    task: Literal["none", "transfer"] = "none"
    transfer: AssistantTransferDraft = Field(default_factory=AssistantTransferDraft)
    # A short-lived convenience context for explicit follow-up requests such
    # as "chuyển thêm cho người này".  It never contains an amount or consent
    # to transfer; the transfer page must resolve the recipient again.
    last_recipient: AssistantTransferDraft | None = None


class AssistantRiskContext(BaseModel):
    """Safe, display-oriented context for the transaction risk coach.

    The browser must send a masked account only. This context is used for a
    single explanation request and is never treated as authorization to act.
    """

    transaction_id: str | None = Field(default=None, max_length=80)
    recipient_name: str | None = Field(default=None, max_length=120)
    recipient_account_masked: str | None = Field(default=None, max_length=24)
    bank_name: str | None = Field(default=None, max_length=80)
    amount: int | None = Field(default=None, ge=0, le=10_000_000_000)
    note: str | None = Field(default=None, max_length=500)
    risk_level: Literal["low", "medium", "high"] = "medium"
    risk_score: float = Field(default=0, ge=0, le=1)
    signals: list[str] = Field(default_factory=list, max_length=8)
    warning_message: str | None = Field(default=None, max_length=500)


class AssistantUiAction(BaseModel):
    type: Literal[
        "navigate_transfer_review",
        "set_guardian_voice_monitoring",
        "navigate_app",
    ]
    transfer: AssistantTransferDraft | None = None
    voice_monitoring_enabled: bool | None = None
    route: Literal[
        "/dashboard",
        "/transfer",
        "/qr?mode=scan",
        "/qr?mode=create",
        "/history",
        "/me",
        "/me?open=password",
        "/me?open=pin",
        "/setup-pin",
        "/setup-face",
        "/terms",
        "/privacy",
        "/mission",
        "/help",
        "/services",
        "/download",
        "/demo",
        "/cookies",
    ] | None = None


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=800)
    task_state: AssistantTaskState = Field(default_factory=AssistantTaskState)


class AssistantRiskCoachRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=800)
    context: AssistantRiskContext
    history: list[AssistantChatTurn] = Field(default_factory=list, max_length=6)
    # The browser can only send a question returned by this endpoint. The
    # server validates it again before it is given to the model.
    guided_question: str | None = Field(default=None, max_length=300)


class AssistantRiskCoachResponse(BaseModel):
    answer: str
    questions: list[str] = Field(default_factory=list, max_length=3)


class AssistantChatResponse(BaseModel):
    answer: str
    out_of_scope: bool = False
    cache_hit: bool = False
    task_state: AssistantTaskState = Field(default_factory=AssistantTaskState)
    action: AssistantUiAction | None = None


class AssistantChatHistoryItem(BaseModel):
    id: str
    question: str
    answer: str
    created_at: datetime


class AssistantChatHistoryResponse(BaseModel):
    items: list[AssistantChatHistoryItem]
