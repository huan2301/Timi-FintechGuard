"""Conservative, auditable auto-promotion policy for blacklist entries."""

from __future__ import annotations

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from src.app.models.blacklist import Blacklist
from src.app.models.risk_assessment import TransactionRiskAssessment, TransactionWarning, WarningFeedback
from src.app.models.transaction import Transaction
from src.app.services.audit import add_audit_log
from src.app.services.bank_normalization import normalize_bank_name

MIN_HIGH_ASSESSMENTS = 3
MIN_INDEPENDENT_USERS = 2
MIN_CONFIRMED_REPORTS = 2


def promote_blacklist_if_eligible(db: Session, account: str, bank: str | None, actor_id=None) -> Blacklist | None:
    account = account.replace(" ", "").strip()
    bank = normalize_bank_name(bank)
    if not account or not bank:
        return None
    existing = db.scalar(select(Blacklist).where(
        Blacklist.entity_type == "account", Blacklist.entity_value == account,
        Blacklist.bank == bank, Blacklist.is_active.is_(True),
    ))
    if existing:
        return existing

    high_users = db.scalar(select(func.count(distinct(Transaction.user_id)))
        .select_from(TransactionRiskAssessment)
        .join(Transaction, Transaction.id == TransactionRiskAssessment.transaction_id)
        .where(Transaction.payee_account == account, Transaction.bank_code == bank,
               TransactionRiskAssessment.risk_level == "high")) or 0
    high_count = db.scalar(select(func.count(TransactionRiskAssessment.id))
        .select_from(TransactionRiskAssessment)
        .join(Transaction, Transaction.id == TransactionRiskAssessment.transaction_id)
        .where(Transaction.payee_account == account, Transaction.bank_code == bank,
               TransactionRiskAssessment.risk_level == "high")) or 0

    confirmed_users = db.scalar(select(func.count(distinct(WarningFeedback.user_id)))
        .select_from(WarningFeedback)
        .join(TransactionWarning, TransactionWarning.id == WarningFeedback.warning_id)
        .join(Transaction, Transaction.id == TransactionWarning.transaction_id)
        .where(Transaction.payee_account == account, Transaction.bank_code == bank,
               WarningFeedback.feedback_type == "confirmed_scam",
               WarningFeedback.review_status != "rejected")) or 0

    reason = None
    if high_count >= MIN_HIGH_ASSESSMENTS and high_users >= MIN_INDEPENDENT_USERS:
        reason = "three_high_assessments_from_two_users"
    elif confirmed_users >= MIN_CONFIRMED_REPORTS:
        reason = "two_confirmed_user_reports"
    if reason is None:
        return None

    entry = Blacklist(
        entity_type="account", entity_value=account, bank=bank, source="agent_consensus",
        risk_score=0.98,
        evidence={"promotion_reason": reason, "high_assessment_count": high_count,
                  "high_assessment_user_count": high_users, "confirmed_report_user_count": confirmed_users},
    )
    db.add(entry)
    db.flush()
    add_audit_log(db, action="blacklist.auto_promoted", actor_id=actor_id,
                  resource_type="blacklist", resource_id=entry.id,
                  metadata={"promotion_reason": reason, "high_assessment_count": high_count,
                            "confirmed_report_user_count": confirmed_users})
    return entry
