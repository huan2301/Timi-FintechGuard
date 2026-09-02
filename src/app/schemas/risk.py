import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RiskLevel = Literal["safe", "low", "medium", "high"]
SignalSeverity = Literal["info", "low", "medium", "high"]
WarningDecision = Literal["proceeded", "cancelled"]
InterventionAction = Literal["start", "verify", "continue", "trust_recipient", "cancel", "proceed"]


class RiskClientContextIn(BaseModel):
    """Optional transaction telemetry; login subclasses require location."""

    device_id: str | None = Field(default=None, min_length=16, max_length=128)
    geo_latitude: float | None = Field(default=None, ge=-90, le=90)
    geo_longitude: float | None = Field(default=None, ge=-180, le=180)
    geo_accuracy_m: float | None = Field(default=None, ge=0, le=100_000)

    def model_post_init(self, __context: object) -> None:
        has_latitude = self.geo_latitude is not None
        has_longitude = self.geo_longitude is not None
        if has_latitude != has_longitude:
            raise ValueError("Vị trí phải có cả vĩ độ và kinh độ")
        if self.geo_accuracy_m is not None and not has_latitude:
            raise ValueError("Độ chính xác vị trí yêu cầu vĩ độ và kinh độ")


class AssessRequest(BaseModel):
    """Input cho một lệnh chuyển tiền trước khi user ra quyết định."""

    payee_account: str = Field(..., min_length=4, max_length=64)
    # Server fills this from the signed lookup token, never from manual input.
    payee_name: str = Field(default="", max_length=255)
    bank_code: str | None = Field(default=None, max_length=100)
    recipient_lookup_token: str = Field(..., min_length=1, max_length=4096)
    amount: int = Field(..., gt=0, le=10_000_000_000)
    note: str | None = Field(default=None, max_length=500)
    currency: str = Field(default="VND", min_length=3, max_length=3)
    client_context: RiskClientContextIn | None = None


class RiskSignalOut(BaseModel):
    signal_type: str
    severity: SignalSeverity
    score: float | None = None
    explanation: str
    evidence: dict[str, object] = Field(default_factory=dict)


class WarningOut(BaseModel):
    id: uuid.UUID
    warning_level: Literal["medium", "high"]
    title: str
    message: str
    transparency_reason: str
    displayed_at: datetime
    countdown_seconds: int


class AssessResponse(BaseModel):
    transaction_id: uuid.UUID
    assessment_id: uuid.UUID
    risk_score: float = Field(..., ge=0, le=1)
    risk_level: RiskLevel
    signals: list[RiskSignalOut] = []
    explanation: str
    recommendation: str
    should_warn: bool
    requires_face_verification: bool = False
    face_verification_nonce: str | None = None
    face_verification_expires_at: datetime | None = None
    warning: WarningOut | None = None
    requires_user_decision: bool = True
    intervention: "InterventionOut | None" = None


class DecisionRequest(BaseModel):
    decision: WarningDecision
    verification_confirmed: bool | None = None
    verification_method: str | None = Field(default=None, max_length=50)
    verification_answers: list[str] = Field(default_factory=list, max_length=3)
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")
    face_verification_confirmed: bool = False
    face_verification_token: str | None = Field(default=None, max_length=4096)


class DecisionResponse(BaseModel):
    transaction_id: uuid.UUID
    transaction_status: Literal["completed", "cancelled", "failed"]
    warning_id: uuid.UUID | None = None
    decided_at: datetime


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    payee_account: str
    payee_name: str
    direction: Literal["outgoing", "incoming"]
    counterparty_name: str
    counterparty_account: str
    bank_code: str | None
    amount: int
    currency: str
    note: str | None = None
    transaction_status: str
    created_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    risk_level: str | None = None
    risk_reason: str | None = None


class TransactionHistoryPage(BaseModel):
    items: list[TransactionOut]
    next_cursor: str | None = None


class TransactionHistorySummary(BaseModel):
    completed_outgoing_today: int = Field(..., ge=0)
    daily_limit: int = Field(..., gt=0)
    remaining_daily_limit: int = Field(..., ge=0)
    total_transactions: int = Field(..., ge=0)


class TrustedRecipientCreate(BaseModel):
    account_number: str = Field(..., min_length=4, max_length=64)
    recipient_name: str = Field(..., min_length=1, max_length=255)
    bank_code: str | None = Field(default=None, max_length=100)


class SavedRecipientCreate(BaseModel):
    """Persist a previously verified recipient in the user's address book."""

    account_number: str = Field(..., min_length=6, max_length=19)
    bank_code: str = Field(..., min_length=2, max_length=100)
    recipient_lookup_token: str = Field(..., min_length=1, max_length=4096)


class SavedRecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    recipient_name: str
    account_number: str
    bank_code: str
    saved_at: datetime
    avatar_url: str | None = None


class WarningFeedbackCreate(BaseModel):
    feedback_type: Literal["helpful", "false_positive", "confirmed_scam", "not_helpful", "unsure"]
    comment: str | None = Field(default=None, max_length=2000)


class InterventionRequest(BaseModel):
    action: InterventionAction = "start"
    response: str | None = Field(default=None, max_length=2000)


class InterventionOut(BaseModel):
    transaction_id: uuid.UUID
    warning_id: uuid.UUID | None = None
    step: int
    total_steps: int
    node_name: str
    message: str
    question: str | None = None
    suggested_actions: list[str] = Field(default_factory=list)
    risk_factors: list[str] = Field(default_factory=list)
    decision_ready: bool = False
    can_proceed: bool = False
