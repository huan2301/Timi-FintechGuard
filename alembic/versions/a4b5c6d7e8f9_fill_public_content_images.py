"""fill public legal and support content with neutral finance illustrations"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings


revision: str = "a4b5c6d7e8f9"
down_revision: str | Sequence[str] | None = "z3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ASSETS = {
    "finance-mobile": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397108/fintechguard/content/finance-mobile.jpg",
    "finance-security": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397109/fintechguard/content/finance-security.jpg",
    "finance-planning": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397110/fintechguard/content/finance-planning.jpg",
    "finance-payment": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787397111/fintechguard/content/finance-payment.jpg",
    "privacy": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396366/fintechguard/content/vixxqz9rin7qmxotkl0q.jpg",
    "mission": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396363/fintechguard/content/fd0p60zaa2kmsm4d6jgd.jpg",
    "services": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396368/fintechguard/content/k0r8hguibbzypq2e48x5.jpg",
    "terms": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396615/fintechguard/content/terms-guide.jpg",
    "help": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396617/fintechguard/content/help-support.jpg",
}


CONTENT_IMAGES = {
    "Dữ liệu được thu thập": ASSETS["finance-security"],
    "Dữ liệu khuôn mặt": ASSETS["finance-mobile"],
    "Mục đích sử dụng": ASSETS["finance-planning"],
    "Bảo vệ dữ liệu": ASSETS["privacy"],
    "Quyền của bạn": ASSETS["finance-planning"],
    "Chấp nhận điều khoản": ASSETS["terms"],
    "Sử dụng dịch vụ": ASSETS["finance-mobile"],
    "Giao dịch và bảo mật": ASSETS["finance-payment"],
    "Trách nhiệm khi giao dịch": ASSETS["finance-payment"],
    "Kênh hỗ trợ chính thức": ASSETS["help"],
    "Vì sao Timi tồn tại": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396817/fintechguard/content/mission-purpose.jpg",
    "An toàn trước tiên": ASSETS["finance-security"],
    "Minh bạch và đồng hành": ASSETS["finance-mobile"],
    "Cam kết của Timi": ASSETS["mission"],
    "Công nghệ vì con người": ASSETS["mission"],
    "Một lớp bảo vệ chủ động": ASSETS["finance-security"],
    "Đo lường bằng sự an tâm": ASSETS["finance-planning"],
    "Dịch vụ Timi": ASSETS["services"],
    "Các lớp dịch vụ trong một trải nghiệm": ASSETS["services"],
    "Bảo vệ trước khi xác nhận": ASSETS["finance-security"],
    "Làm sao để đổi mật khẩu?": ASSETS["help"],
    "Quên mã PIN giao dịch phải làm gì?": ASSETS["finance-security"],
    "Tại sao giao dịch cần xác minh khuôn mặt?": ASSETS["finance-mobile"],
    "Cần hỗ trợ trực tiếp thì liên hệ ở đâu?": ASSETS["help"],
    "Luôn có nơi để tìm hỗ trợ": ASSETS["help"],
    "Làm sao để đăng ký và xác minh email?": ASSETS["finance-mobile"],
    "Làm gì khi nhận cảnh báo rủi ro cao?": ASSETS["finance-security"],
    "Đội ngũ hỗ trợ Timi": ASSETS["help"],
}


def upgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    connection = op.get_bind()
    for title, image_url in CONTENT_IMAGES.items():
        connection.execute(
            sa.text(f"UPDATE {table} SET image_url = :image_url WHERE title = :title"),
            {"image_url": image_url, "title": title},
        )


def downgrade() -> None:
    # Keep the image assignments when rolling back; they are safe content metadata.
    pass
