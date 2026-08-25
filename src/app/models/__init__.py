"""Import all active ORM models so Alembic sees one metadata registry."""

from src.app.db.base import Base
from src.app.models.assistant_chat_exchange import AssistantChatExchange
from src.app.models.audit_log import AuditLog
from src.app.models.blacklist import Blacklist
from src.app.models.compliance import DataRetentionPolicy, UserConsent
from src.app.models.content_item import ContentItem
from src.app.models.content_chunk import ContentChunk
from src.app.models.face_enrollment import FaceEnrollment
from src.app.models.face_verification_log import FaceVerificationLog
from src.app.models.face_verification_state import FaceVerificationState
from src.app.models.email_change_verification import EmailChangeVerification
from src.app.models.intervention_log import InterventionLog
from src.app.models.newsletter_subscriber import NewsletterSubscriber
from src.app.models.registration_verification import RegistrationVerification
from src.app.models.model_registry import IntelligenceSource, ModelVersion
from src.app.models.recipient_directory import RecipientDirectory
from src.app.models.risk_assessment import (
    RiskLevel,
    RiskSignal,
    TransactionRiskAssessment,
    TransactionWarning,
    WarningDecision,
    WarningFeedback,
)
from src.app.models.scam_guardian import (
    ScamAlert,
    ScamConversationSegment,
    ScamGuardianSession,
    ScamRiskEvent,
    ScamSignal,
)
from src.app.models.scam_pattern import ScamPattern
from src.app.models.scam_report import ScamReport
from src.app.models.timi_ledger_entry import TimiLedgerEntry, TimiLedgerEntryType
from src.app.models.transaction import Transaction, TransactionEnvironment, TransactionStatus
from src.app.models.transaction_risk_context import TransactionRiskContext
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.models.user import User, UserRole
from src.app.models.user_card import UserCard

__all__ = [
    "AuditLog",
    "AssistantChatExchange",
    "Base",
    "Blacklist",
    "DataRetentionPolicy",
    "ContentItem",
    "ContentChunk",
    "FaceEnrollment",
    "FaceVerificationLog",
    "FaceVerificationState",
    "EmailChangeVerification",
    "IntelligenceSource",
    "InterventionLog",
    "NewsletterSubscriber",
    "RegistrationVerification",
    "ModelVersion",
    "RiskLevel",
    "RiskSignal",
    "RecipientDirectory",
    "ScamPattern",
    "ScamReport",
    "ScamConversationSegment",
    "ScamGuardianSession",
    "ScamAlert",
    "ScamRiskEvent",
    "ScamSignal",
    "Transaction",
    "TransactionEnvironment",
    "TransactionRiskAssessment",
    "TransactionRiskContext",
    "TransactionStatus",
    "TimiLedgerEntry",
    "TimiLedgerEntryType",
    "TransactionWarning",
    "TrustedRecipient",
    "User",
    "UserConsent",
    "UserRole",
    "UserCard",
    "WarningDecision",
    "WarningFeedback",
]
