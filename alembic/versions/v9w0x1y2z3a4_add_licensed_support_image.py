"""add a licensed support illustration to managed content"""

from collections.abc import Sequence
import uuid
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "v9w0x1y2z3a4"
down_revision: str | Sequence[str] | None = "u8v9w0x1y2z3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    content = sa.table(
        "content_items", sa.column("id", sa.Uuid()), sa.column("page_key", sa.String()),
        sa.column("content_type", sa.String()), sa.column("title", sa.String()),
        sa.column("body", sa.Text()), sa.column("image_url", sa.String()),
        sa.column("placement", sa.String()), sa.column("is_published", sa.Boolean()), sa.column("sort_order", sa.Integer()), schema=schema,
    )
    op.bulk_insert(content, [{
        "id": uuid.uuid4(),
        "page_key": "help",
        "content_type": "image",
        "title": "Đội ngũ hỗ trợ Timi",
        "body": "Hình minh họa hỗ trợ khách hàng. Nguồn: Unsplash, sử dụng theo Unsplash License.",
        "image_url": "https://images.unsplash.com/photo-1712159018726-4564d92f3ec2?auto=format&fit=crop&fm=jpg&q=80&w=1600",
        "placement": "middle",
        "is_published": True,
        "sort_order": 20,
    }])


def downgrade() -> None:
    schema = get_settings().database_schema
    op.execute(sa.text(f"DELETE FROM {schema}.content_items WHERE page_key = 'help' AND sort_order = 20"))
