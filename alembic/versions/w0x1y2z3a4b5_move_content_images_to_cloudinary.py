"""point managed content images at the project's Cloudinary assets"""

from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "w0x1y2z3a4b5"
down_revision: str | Sequence[str] | None = "v9w0x1y2z3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    updates = {
        "Bảo vệ dữ liệu nhiều lớp": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396366/fintechguard/content/vixxqz9rin7qmxotkl0q.jpg",
        "Công nghệ vì con người": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396363/fintechguard/content/fd0p60zaa2kmsm4d6jgd.jpg",
        "Các lớp dịch vụ trong một trải nghiệm": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396368/fintechguard/content/k0r8hguibbzypq2e48x5.jpg",
    }
    for title, image_url in updates.items():
        op.get_bind().execute(sa.text(f"UPDATE {table} SET image_url = :image_url WHERE title = :title"), {"image_url": image_url, "title": title})


def downgrade() -> None:
    # The previous URLs were external source URLs; leaving the Cloudinary URLs
    # in place is safer than restoring potentially unavailable hotlinks.
    pass
