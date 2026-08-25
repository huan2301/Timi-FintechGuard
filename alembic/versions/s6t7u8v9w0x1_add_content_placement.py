"""add content placement"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "s6t7u8v9w0x1"
down_revision: str | Sequence[str] | None = "r5s6t7u8v9w0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("content_items", sa.Column("placement", sa.String(length=10), server_default="middle", nullable=False), schema=get_settings().database_schema)


def downgrade() -> None:
    op.drop_column("content_items", "placement", schema=get_settings().database_schema)
