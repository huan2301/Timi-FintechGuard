import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DECIMAL, JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20))
    role = Column(String(20), default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    transactions = relationship("Transaction", back_populates="user")
    trusted_recipients = relationship("TrustedRecipient", back_populates="user")


class TrustedRecipient(Base):
    __tablename__ = "trusted_recipients"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_name = Column(String(100), nullable=False)
    account_number = Column(String(100), nullable=False)
    bank_code = Column(String(20))
    trusted_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    user = relationship("User", back_populates="trusted_recipients")


class Blacklist(Base):
    __tablename__ = "blacklist"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(20), nullable=False)  # "account" | "phone"
    entity_value = Column(String(255), nullable=False, index=True)  # STK hoặc SDT
    bank = Column(String(100), nullable=True, index=True)  # ✅ THÊM
    bank = Column(String(100), nullable=True, index=True)  # ✅ THÊM DÒNG NÀY
    source = Column(String(50), nullable=False)
    risk_score = Column(DECIMAL(3, 2), default=0.95)
    evidence = Column(JSON)  # Chỉ chứa: ten, so_tien_bi_lua, sdt, luot_xem
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # ✅ THÊM INDEX cho query nhanh theo STK + Ngân hàng
    __table_args__ = (Index("idx_blacklist_account_bank", "entity_value", "bank"),)


class ScamPattern(Base):
    __tablename__ = "scam_patterns"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pattern_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    keywords = Column(ARRAY(Text))
    risk_weight = Column(DECIMAL(3, 2), default=0.5)
    vector_embedding = Column(JSON)  # Đổi từ VECTOR sang JSONB
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recipient_name = Column(String(100), nullable=False)
    recipient_account = Column(String(100), nullable=False)
    recipient_bank = Column(String(20))
    amount = Column(DECIMAL(15, 2), nullable=False)
    currency = Column(String(10), default="VND")
    description = Column(Text)
    ml_risk_score = Column(DECIMAL(4, 3))
    rule_risk_score = Column(DECIMAL(4, 3))
    final_risk_score = Column(DECIMAL(4, 3))
    risk_level = Column(String(20))
    agent_warning_shown = Column(Boolean, default=False)
    warning_reason = Column(Text)
    user_decision = Column(String(20), default="pending")
    user_decision_at = Column(DateTime(timezone=True))
    status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    user = relationship("User", back_populates="transactions")
    interventions = relationship("InterventionLog", back_populates="transaction")


class InterventionLog(Base):
    __tablename__ = "intervention_logs"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(PG_UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    step_number = Column(Integer, nullable=False)
    agent_message = Column(Text, nullable=False)
    user_response = Column(Text)
    risk_factors = Column(JSON)
    suggested_actions = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    transaction = relationship("Transaction", back_populates="interventions")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_name = Column(String(50), nullable=False)
    record_id = Column(PG_UUID(as_uuid=True), nullable=False)
    action = Column(String(20), nullable=False)
    old_data = Column(JSON)
    new_data = Column(JSON)
    performed_by = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    performed_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    ip_address = Column(INET)
    user_agent = Column(Text)


class ScamReport(Base):
    __tablename__ = "scam_reports"
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    transaction_id = Column(PG_UUID(as_uuid=True), ForeignKey("transactions.id"))
    report_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), default="open")
    admin_note = Column(Text)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
