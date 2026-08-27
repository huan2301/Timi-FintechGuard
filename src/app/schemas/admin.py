import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class BlacklistCreate(BaseModel):
    entity_type: Literal["account", "phone", "email", "url"]
    entity_value: str = Field(..., min_length=1, max_length=255)
    bank: str | None = Field(default=None, max_length=100)
    source: str = Field(..., min_length=1, max_length=255)
    risk_score: float = Field(default=0.95, ge=0, le=1)
    evidence: dict[str, Any] | None = None


class BlacklistOut(BlacklistCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BlacklistPage(BaseModel):
    """One stable, newest-first page for the admin blacklist."""

    items: list[BlacklistOut]
    next_cursor: str | None = None


class AdminFaceActionRequest(BaseModel):
    face_verification_token: str = Field(..., min_length=20, max_length=4096)


class ScamPatternCreate(BaseModel):
    pattern_name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., min_length=1, max_length=10_000)
    keywords: list[str] = Field(default_factory=list, max_length=50)
    risk_weight: float = Field(default=0.5, ge=0, le=1)
    source_id: uuid.UUID | None = None


class ScamPatternOut(ScamPatternCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vector_document_id: uuid.UUID | None
    embedding_model: str | None
    embedding_updated_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    total_transactions: int
    by_risk_level: dict[str, int]
    high_risk_count: int
    high_risk_cancelled: int
    recommendation_compliance_rate: float | None
    blacklist_size: int
    pattern_count: int


class AgentMetricOut(BaseModel):
    """Durable execution and domain-event counters for one agent."""

    agent_id: str
    name: str
    description: str
    group: Literal["supervisor", "standalone"]
    status: Literal["ready", "active", "legacy"]
    capabilities: list[str] = Field(default_factory=list)
    api_path: str
    calls: int = Field(ge=0)
    successes: int = Field(ge=0)
    failures: int = Field(ge=0)
    success_rate: float | None = Field(default=None, ge=0, le=1)
    avg_latency_ms: float | None = Field(default=None, ge=0)
    last_activity_at: datetime | None = None
    domain_events: int = Field(default=0, ge=0)
    domain_last_activity_at: datetime | None = None


class SupervisorMetricOut(BaseModel):
    id: str
    name: str
    routing_mode: str
    managed_agent_count: int = Field(ge=0)
    dispatches: int = Field(ge=0)
    successes: int = Field(ge=0)
    failures: int = Field(ge=0)
    success_rate: float | None = Field(default=None, ge=0, le=1)
    avg_latency_ms: float | None = Field(default=None, ge=0)
    last_activity_at: datetime | None = None


class AgentMetricsOut(BaseModel):
    generated_at: datetime
    supervisor: SupervisorMetricOut
    managed_agents: list[AgentMetricOut]
    intervention_agent: AgentMetricOut


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    metadata_json: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime


class AdminTransactionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    payee_account: str
    payee_name: str
    bank_code: str | None
    amount: int
    transaction_status: str
    risk_level: str | None
    created_at: datetime


class AdminUserOut(BaseModel):
    """User data that may be viewed only by an administrator."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: Literal["user", "admin"]
    is_active: bool
    balance: int
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class UserStatusUpdate(BaseModel):
    is_active: bool


class ContentItemCreate(BaseModel):
    page_key: Literal["home", "dashboard", "privacy", "mission", "terms", "services", "help"]
    content_type: Literal["article", "review", "image"]
    title: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=20_000)
    image_url: str | None = Field(default=None, max_length=1000)
    placement: Literal["top", "middle", "bottom"] = "middle"
    is_published: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)


class ContentItemUpdate(ContentItemCreate):
    pass


class ContentItemOut(ContentItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
