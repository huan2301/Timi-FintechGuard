"""add admin-managed page content items"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from src.app.config import get_settings

revision: str = "q4r5s6t7u8v9"
down_revision: str | Sequence[str] | None = "p3q4r5s6t7u8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    op.create_table(
        "content_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("page_key", sa.String(length=64), nullable=False),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(length=1000), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index("ix_content_items_page_key", "content_items", ["page_key"], schema=schema)
    op.create_index("ix_content_items_content_type", "content_items", ["content_type"], schema=schema)


def downgrade() -> None:
    schema = get_settings().database_schema
    op.drop_index("ix_content_items_content_type", table_name="content_items", schema=schema)
    op.drop_index("ix_content_items_page_key", table_name="content_items", schema=schema)
    op.drop_table("content_items", schema=schema)
