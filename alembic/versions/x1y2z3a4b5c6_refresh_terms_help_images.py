"""refresh public illustrations for terms and help pages"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings


revision: str = "x1y2z3a4b5c6"
down_revision: str | Sequence[str] | None = "w0x1y2z3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPDATES = {
    "Sử dụng Timi an toàn và đúng mục đích": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396615/fintechguard/content/terms-guide.jpg",
    "Luôn có nơi để tìm hỗ trợ": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396617/fintechguard/content/help-support.jpg",
}


def upgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    connection = op.get_bind()
    for title, image_url in UPDATES.items():
        connection.execute(
            sa.text(f"UPDATE {table} SET image_url = :image_url WHERE title = :title"),
            {"image_url": image_url, "title": title},
        )


def downgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    connection = op.get_bind()
    for title in UPDATES:
        connection.execute(
            sa.text(f"UPDATE {table} SET image_url = NULL WHERE title = :title"),
            {"title": title},
        )
