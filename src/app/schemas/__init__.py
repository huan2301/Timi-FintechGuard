from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import datetime
from uuid import UUID
from .user import UserOut
from .auth import RegisterRequest, LoginRequest, TokenResponse, AuthResponse
# ========== USER ==========
class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)

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
    recipient_bank: Optional[str] = Field(None, max_length=20)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="VND", max_length=10)
    description: Optional[str] = None

class RiskAnalysis(BaseModel):
    ml_risk_score: Optional[float] = None
    rule_risk_score: Optional[float] = None
    final_risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    warning_reason: Optional[str] = None
    matched_blacklist: List[Dict[str, Any]] = []
    matched_patterns: List[Dict[str, Any]] = []

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    recipient_name: str
    recipient_account: str
    amount: Decimal
    risk_level: Optional[str]
    status: str
    agent_warning_shown: bool
    user_decision: Optional[str]
    created_at: datetime
    risk_analysis: Optional[RiskAnalysis] = None

class TransactionDecision(BaseModel):
    decision: str = Field(..., pattern="^(confirmed|cancelled|escalated)$")
    user_note: Optional[str] = None

# ========== INTERVENTION ==========
class InterventionResponse(BaseModel):
    transaction_id: UUID
    current_step: int
    total_steps: int
    message: str
    actions: List[str]
    can_proceed: bool
    risk_factors: List[str] = []
    requires_decision: bool = True

# ========== BLACKLIST (Admin) ==========
class BlacklistCreate(BaseModel):
    entity_type: str = Field(..., pattern="^(account|phone|email|url)$")
    entity_value: str
    source: str
    risk_score: float = Field(..., ge=0.0, le=1.0)
    evidence: Optional[Dict[str, Any]] = None

class BlacklistResponse(BlacklistCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    is_active: bool
    created_at: datetime

# ========== SCAM REPORT ==========
class ScamReportCreate(BaseModel):
    transaction_id: Optional[UUID] = None
    report_type: str = Field(..., pattern="^(false_positive|new_scam|bypass)$")
    description: str = Field(..., min_length=10)