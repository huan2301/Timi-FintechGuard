from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .auth import AuthResponse, LoginRequest, RegisterRequest, TokenResponse
from .user import UserOut

__all__ = [
    "AuthResponse",
    "LoginRequest",
    "RegisterRequest",
    "TokenResponse",
    "UserOut",
]


# ========== USER ==========
class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=20)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: str
    is_active: bool
    created_at: datetime


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ========== TRANSACTION ==========
class TransactionCreate(BaseModel):
    recipient_name: str = Field(..., min_length=1, max_length=100)
    recipient_account: str = Field(..., min_length=1, max_length=100)
    recipient_bank: str | None = Field(None, max_length=20)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="VND", max_length=10)
    description: str | None = None


class RiskAnalysis(BaseModel):
    ml_risk_score: float | None = None
    rule_risk_score: float | None = None
    final_risk_score: float | None = None
    risk_level: str | None = None
    warning_reason: str | None = None
    matched_blacklist: list[dict[str, Any]] = []
    matched_patterns: list[dict[str, Any]] = []


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    recipient_name: str
    recipient_account: str
    amount: Decimal
    risk_level: str | None
    status: str
    agent_warning_shown: bool
    user_decision: str | None
    created_at: datetime
    risk_analysis: RiskAnalysis | None = None


class TransactionDecision(BaseModel):
    decision: str = Field(..., pattern="^(confirmed|cancelled|escalated)$")
    user_note: str | None = None


# ========== INTERVENTION ==========
class InterventionResponse(BaseModel):
    transaction_id: UUID
    current_step: int
    total_steps: int
    message: str
    actions: list[str]
    can_proceed: bool
    risk_factors: list[str] = []
    requires_decision: bool = True


# ========== BLACKLIST (Admin) ==========
class BlacklistCreate(BaseModel):
    entity_type: str = Field(..., pattern="^(account|phone|email|url)$")
    entity_value: str
    source: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    evidence: dict[str, Any] | None = None


class BlacklistResponse(BlacklistCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    is_active: bool
    created_at: datetime


# ========== SCAM REPORT ==========
class ScamReportCreate(BaseModel):
    transaction_id: UUID | None = None
    report_type: str = Field(..., pattern="^(false_positive|new_scam|bypass)$")
    description: str = Field(..., min_length=10)
