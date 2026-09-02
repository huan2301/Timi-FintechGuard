"""harden authentication and persist user preferences

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from src.app.config import get_settings

revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.add_column(
        "users",
        sa.Column("auth_token_version", sa.Integer(), server_default="0", nullable=False),
        schema=schema,
    )
    op.add_column(
        "users",
        sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False),
        schema=schema,
    )
    op.add_column(
        "users",
        sa.Column("login_locked_until", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )
    op.add_column(
        "users",
        sa.Column("failed_pin_attempts", sa.Integer(), server_default="0", nullable=False),
        schema=schema,
    )
    op.add_column(
        "users",
        sa.Column("pin_locked_until", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )

    op.create_table(
        "password_reset_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("otp_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], [f"{schema}.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("user_id"),
        schema=schema,
    )
    op.create_index(
        "ix_password_reset_verifications_email",
        "password_reset_verifications",
        ["email"],
        unique=True,
        schema=schema,
    )
    op.create_index(
        "ix_password_reset_verifications_user_id",
        "password_reset_verifications",
        ["user_id"],
        unique=True,
        schema=schema,
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=40), server_default="product_update", nullable=False),
        sa.Column("version", sa.String(length=40), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], [f"{schema}.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_notifications_user_id",
        "notifications",
        ["user_id"],
        unique=False,
        schema=schema,
    )

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("transaction_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("security_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("promotion_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], [f"{schema}.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
        schema=schema,
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_table("notification_preferences", schema=schema)
    op.drop_index("ix_notifications_user_id", table_name="notifications", schema=schema)
    op.drop_table("notifications", schema=schema)
    op.drop_index(
        "ix_password_reset_verifications_user_id",
        table_name="password_reset_verifications",
        schema=schema,
    )
    op.drop_index(
        "ix_password_reset_verifications_email",
        table_name="password_reset_verifications",
        schema=schema,
    )
    op.drop_table("password_reset_verifications", schema=schema)
    op.drop_column("users", "pin_locked_until", schema=schema)
    op.drop_column("users", "failed_pin_attempts", schema=schema)
    op.drop_column("users", "login_locked_until", schema=schema)
    op.drop_column("users", "failed_login_attempts", schema=schema)
    op.drop_column("users", "auth_token_version", schema=schema)
