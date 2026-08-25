"""complete neutral illustrations for privacy content"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings


revision: str = "b5c6d7e8f9a0"
down_revision: str | Sequence[str] | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


IMAGES = {
    "Minh bạch trong sử dụng dữ liệu": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397108/fintechguard/content/finance-mobile.jpg",
    "Thời gian lưu trữ và xóa dữ liệu": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397110/fintechguard/content/finance-planning.jpg",
}


def upgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    connection = op.get_bind()
    for title, image_url in IMAGES.items():
        connection.execute(
            sa.text(f"UPDATE {table} SET image_url = :image_url WHERE title = :title"),
            {"image_url": image_url, "title": title},
        )


def downgrade() -> None:
    pass
