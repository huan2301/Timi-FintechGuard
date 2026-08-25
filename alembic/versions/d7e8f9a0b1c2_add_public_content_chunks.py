"""add pgvector-backed chunks for public content RAG"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op
from src.app.config import get_settings

revision: str = "d7e8f9a0b1c2"
down_revision: str | Sequence[str] | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    schema = get_settings().database_schema
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "content_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("content_item_id", sa.Uuid(), nullable=False),
        sa.Column("page_key", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=255), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=True),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True),
        sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["content_item_id"], [f"{schema}.content_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=schema,
    )
    op.create_index(
        "ix_content_chunks_page_published",
        "content_chunks",
        ["page_key", "is_published"],
        schema=schema,
    )
    op.create_index(
        "ix_content_chunks_item_order",
        "content_chunks",
        ["content_item_id", "chunk_index"],
        schema=schema,
    )
    op.create_index(
        "ix_content_chunks_page_key",
        "content_chunks",
        ["page_key"],
        schema=schema,
    )
    op.create_index(
        "ix_content_chunks_content_hash",
        "content_chunks",
        ["content_hash"],
        schema=schema,
    )


def downgrade() -> None:
    op.drop_table("content_chunks", schema=get_settings().database_schema)
