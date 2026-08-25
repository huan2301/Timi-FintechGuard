"""create anti-scam transaction, HITL, intelligence and compliance schema

Revision ID: d7649374920f
Revises:
Create Date: 2026-08-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7649374920f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB()


def _id_column() -> sa.Column:
    return sa.Column(
        "id", UUID, primary_key=True, server_default=sa.text("uuid_generate_v4()")
    )


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        "users",
        _id_column(),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("balance", sa.BigInteger(), nullable=False, server_default="50000000"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "intelligence_sources",
        _id_column(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("license_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("name", name="uq_intelligence_sources_name"),
    )

    op.create_table(
        "model_versions",
        _id_column(),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("version", sa.String(100), nullable=False),
        sa.Column("model_type", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(100), nullable=True),
        sa.Column("configuration", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("model_name", "version", name="uq_model_versions_name_version"),
    )

    op.create_table(
        "blacklist",
        _id_column(),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_value", sa.String(255), nullable=False),
        sa.Column("bank", sa.String(100), nullable=True),
        sa.Column("source", sa.String(255), nullable=False),
        sa.Column("risk_score", sa.Numeric(5, 4), nullable=False, server_default="0.9500"),
        sa.Column("evidence", JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "entity_type IN ('account', 'phone', 'email', 'url')",
            name="ck_blacklist_entity_type",
        ),
        sa.CheckConstraint("risk_score BETWEEN 0 AND 1", name="ck_blacklist_risk_score"),
    )
    op.create_index("ix_blacklist_entity_value", "blacklist", ["entity_value"])
    op.create_index(
        "ix_blacklist_active_account_bank",
        "blacklist",
        ["entity_value", "bank"],
        postgresql_where=sa.text("entity_type = 'account' AND is_active = true"),
    )

    op.create_table(
        "scam_patterns",
        _id_column(),
        sa.Column("pattern_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("keywords", postgresql.ARRAY(sa.String(120)), nullable=True),
        sa.Column("risk_weight", sa.Numeric(5, 4), nullable=False, server_default="0.5000"),
        sa.Column("source_id", UUID, sa.ForeignKey("intelligence_sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vector_document_id", UUID, nullable=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("embedding_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("risk_weight BETWEEN 0 AND 1", name="ck_scam_patterns_risk_weight"),
        sa.UniqueConstraint("pattern_name", name="uq_scam_patterns_name"),
    )
    op.create_index("ix_scam_patterns_keywords", "scam_patterns", ["keywords"], postgresql_using="gin")

    op.create_table(
        "trusted_recipients",
        _id_column(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("account_number", sa.String(64), nullable=False),
        sa.Column("bank_code", sa.String(32), nullable=True),
        sa.Column("trusted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "account_number", "bank_code", name="uq_trusted_recipient_per_user"),
    )
    op.create_index("ix_trusted_recipients_user_id", "trusted_recipients", ["user_id"])

    op.create_table(
        "transactions",
        _id_column(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payee_account", sa.String(64), nullable=False),
        sa.Column("payee_name", sa.String(255), nullable=False),
        sa.Column("bank_code", sa.String(32), nullable=True),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("transaction_status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("environment", sa.String(20), nullable=False, server_default="sandbox"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="VND"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "transaction_status IN ('draft', 'risk_checking', 'awaiting_decision', 'processing', 'completed', 'failed', 'cancelled')",
            name="ck_transactions_status",
        ),
        sa.CheckConstraint("environment IN ('sandbox', 'production')", name="ck_transactions_environment"),
        sa.CheckConstraint("char_length(currency) = 3", name="ck_transactions_currency"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_payee_account", "transactions", ["payee_account"])
    op.create_index("ix_transactions_status", "transactions", ["transaction_status"])

    op.create_table(
        "transaction_risk_assessments",
        _id_column(),
        sa.Column("transaction_id", UUID, sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("risk_score", sa.Numeric(5, 4), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("should_warn", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("rules_version", sa.String(100), nullable=True),
        sa.Column("blacklist_match_found", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("raw_result", JSONB, nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("risk_score BETWEEN 0 AND 1", name="ck_assessment_score"),
        sa.CheckConstraint("risk_level IN ('safe', 'low', 'medium', 'high')", name="ck_assessment_level"),
    )
    op.create_index("ix_transaction_risk_assessments_transaction_id", "transaction_risk_assessments", ["transaction_id"])

    op.create_table(
        "risk_signals",
        _id_column(),
        sa.Column("assessment_id", UUID, sa.ForeignKey("transaction_risk_assessments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("signal_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("score", sa.Numeric(5, 4), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("matched_blacklist_id", UUID, sa.ForeignKey("blacklist.id", ondelete="SET NULL"), nullable=True),
        sa.Column("matched_pattern_id", UUID, sa.ForeignKey("scam_patterns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("evidence", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("severity IN ('info', 'low', 'medium', 'high')", name="ck_risk_signals_severity"),
    )
    op.create_index("ix_risk_signals_assessment_id", "risk_signals", ["assessment_id"])

    op.create_table(
        "transaction_warnings",
        _id_column(),
        sa.Column("transaction_id", UUID, sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assessment_id", UUID, sa.ForeignKey("transaction_risk_assessments.id"), nullable=False),
        sa.Column("warning_level", sa.String(20), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("transparency_reason", sa.Text(), nullable=False),
        sa.Column("displayed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("countdown_seconds", sa.SmallInteger(), nullable=False, server_default="30"),
        sa.Column("user_decision", sa.String(20), nullable=True),
        sa.Column("verification_confirmed", sa.Boolean(), nullable=True),
        sa.Column("verification_method", sa.String(50), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("warning_level IN ('medium', 'high')", name="ck_transaction_warnings_level"),
        sa.CheckConstraint("countdown_seconds BETWEEN 0 AND 60", name="ck_transaction_warnings_countdown"),
        sa.CheckConstraint("user_decision IS NULL OR user_decision IN ('proceeded', 'cancelled')", name="ck_transaction_warnings_decision"),
    )
    op.create_index("ix_transaction_warnings_transaction_id", "transaction_warnings", ["transaction_id"])
    op.create_index("ix_transaction_warnings_assessment_id", "transaction_warnings", ["assessment_id"])

    op.create_table(
        "intervention_logs",
        _id_column(),
        sa.Column("transaction_id", UUID, sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("warning_id", UUID, sa.ForeignKey("transaction_warnings.id", ondelete="CASCADE"), nullable=True),
        sa.Column("agent_run_id", UUID, nullable=True),
        sa.Column("node_name", sa.String(100), nullable=True),
        sa.Column("step_number", sa.Integer(), nullable=True),
        sa.Column("agent_message", sa.Text(), nullable=True),
        sa.Column("user_response", sa.Text(), nullable=True),
        sa.Column("risk_factors", JSONB, nullable=True),
        sa.Column("suggested_actions", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_intervention_logs_transaction_id", "intervention_logs", ["transaction_id"])

    op.create_table(
        "warning_feedback",
        _id_column(),
        sa.Column("warning_id", UUID, sa.ForeignKey("transaction_warnings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feedback_type", sa.String(30), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("review_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("feedback_type IN ('helpful', 'false_positive', 'confirmed_scam', 'not_helpful', 'unsure')", name="ck_warning_feedback_type"),
        sa.CheckConstraint("review_status IN ('pending', 'validated', 'rejected')", name="ck_warning_feedback_review_status"),
        sa.UniqueConstraint("warning_id", name="uq_warning_feedback_warning"),
    )
    op.create_index("ix_warning_feedback_user_id", "warning_feedback", ["user_id"])

    op.create_table(
        "scam_reports",
        _id_column(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_id", UUID, sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("report_type IN ('false_positive', 'new_scam', 'bypass')", name="ck_scam_reports_type"),
        sa.CheckConstraint("status IN ('open', 'reviewing', 'resolved', 'rejected')", name="ck_scam_reports_status"),
    )
    op.create_index("ix_scam_reports_user_id", "scam_reports", ["user_id"])

    op.create_table(
        "audit_logs",
        _id_column(),
        sa.Column("actor_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", UUID, nullable=True),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])

    op.create_table(
        "user_consents",
        _id_column(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("consent_type", sa.String(50), nullable=False),
        sa.Column("consent_version", sa.String(30), nullable=False),
        sa.Column("is_granted", sa.Boolean(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.CheckConstraint("consent_type IN ('terms_of_service', 'privacy_policy', 'fraud_analysis', 'model_improvement')", name="ck_user_consents_type"),
        sa.UniqueConstraint("user_id", "consent_type", "consent_version", name="uq_user_consent_version"),
    )
    op.create_index("ix_user_consents_user_id", "user_consents", ["user_id"])

    op.create_table(
        "data_retention_policies",
        _id_column(),
        sa.Column("data_category", sa.String(50), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("anonymize_after_days", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("retention_days > 0", name="ck_retention_days_positive"),
        sa.UniqueConstraint("data_category", name="uq_data_retention_policies_category"),
    )


def downgrade() -> None:
    op.drop_table("data_retention_policies")
    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_scam_reports_user_id", table_name="scam_reports")
    op.drop_table("scam_reports")
    op.drop_index("ix_warning_feedback_user_id", table_name="warning_feedback")
    op.drop_table("warning_feedback")
    op.drop_index("ix_intervention_logs_transaction_id", table_name="intervention_logs")
    op.drop_table("intervention_logs")
    op.drop_index("ix_transaction_warnings_assessment_id", table_name="transaction_warnings")
    op.drop_index("ix_transaction_warnings_transaction_id", table_name="transaction_warnings")
    op.drop_table("transaction_warnings")
    op.drop_index("ix_risk_signals_assessment_id", table_name="risk_signals")
    op.drop_table("risk_signals")
    op.drop_index("ix_transaction_risk_assessments_transaction_id", table_name="transaction_risk_assessments")
    op.drop_table("transaction_risk_assessments")
    op.drop_index("ix_transactions_status", table_name="transactions")
    op.drop_index("ix_transactions_payee_account", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_trusted_recipients_user_id", table_name="trusted_recipients")
    op.drop_table("trusted_recipients")
    op.drop_index("ix_scam_patterns_keywords", table_name="scam_patterns")
    op.drop_table("scam_patterns")
    op.drop_index("ix_blacklist_active_account_bank", table_name="blacklist")
    op.drop_index("ix_blacklist_entity_value", table_name="blacklist")
    op.drop_table("blacklist")
    op.drop_table("model_versions")
    op.drop_table("intelligence_sources")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
