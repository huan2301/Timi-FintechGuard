"""add encrypted user cards"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "r5s6t7u8v9w0"
down_revision: str | Sequence[str] | None = "q4r5s6t7u8v9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "user_cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("nickname", sa.String(length=80), nullable=False),
        sa.Column("card_number_encrypted", sa.String(length=1000), nullable=False),
        sa.Column("holder_name", sa.String(length=255), nullable=False),
        sa.Column("expiry_month", sa.Integer(), nullable=False),
        sa.Column("expiry_year", sa.Integer(), nullable=False),
        sa.Column("brand", sa.String(length=40), server_default="Visa", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index("ix_user_cards_user_id", "user_cards", ["user_id"], schema=schema)


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_user_cards_user_id", table_name="user_cards", schema=schema)
    op.drop_table("user_cards", schema=schema)
