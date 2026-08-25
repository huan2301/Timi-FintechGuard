"""add illustration to the mission purpose content item"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings


revision: str = "y2z3a4b5c6d7"
down_revision: str | Sequence[str] | None = "x1y2z3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TITLE = "Vì sao Timi tồn tại"
IMAGE_URL = "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396817/fintechguard/content/mission-purpose.jpg"


def upgrade() -> None:
    schema = get_settings().database_schema
    op.get_bind().execute(
        sa.text(f"UPDATE {schema}.content_items SET image_url = :image_url WHERE title = :title"),
        {"image_url": IMAGE_URL, "title": TITLE},
    )


def downgrade() -> None:
    schema = get_settings().database_schema
    op.get_bind().execute(
        sa.text(f"UPDATE {schema}.content_items SET image_url = NULL WHERE title = :title"),
        {"title": TITLE},
    )
