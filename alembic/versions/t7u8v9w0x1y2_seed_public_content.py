"""seed Vietnamese public page content"""

from collections.abc import Sequence
import uuid
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "t7u8v9w0x1y2"
down_revision: str | Sequence[str] | None = "s6t7u8v9w0x1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = get_settings().database_schema
    content = sa.table(
        "content_items",
        sa.column("id", sa.Uuid()), sa.column("page_key", sa.String()), sa.column("content_type", sa.String()),
        sa.column("title", sa.String()), sa.column("body", sa.Text()), sa.column("image_url", sa.String()),
        sa.column("placement", sa.String()), sa.column("is_published", sa.Boolean()), sa.column("sort_order", sa.Integer()), schema=schema,
    )
    rows = [
        ("privacy", "article", "Dữ liệu được thu thập", "Timi thu thập thông tin tài khoản, giao dịch và dữ liệu kỹ thuật cần thiết để vận hành, bảo vệ và cải thiện dịch vụ.", "top", 1),
        ("privacy", "article", "Dữ liệu khuôn mặt", "Dữ liệu khuôn mặt chỉ được dùng cho đăng ký và xác thực theo lựa chọn của bạn, không dùng cho mục đích quảng cáo.", "middle", 2),
        ("privacy", "article", "Quyền của bạn", "Bạn có thể yêu cầu kiểm tra, cập nhật hoặc xóa thông tin cá nhân theo quy trình hỗ trợ của Timi.", "bottom", 3),
        ("terms", "article", "Chấp nhận điều khoản", "Khi tạo tài khoản hoặc sử dụng Timi, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản sử dụng.", "top", 1),
        ("terms", "article", "Sử dụng dịch vụ", "Bạn chỉ sử dụng Timi cho mục đích hợp pháp và không được can thiệp, phá hoại hoặc thực hiện hành vi gian lận.", "middle", 2),
        ("terms", "article", "Giao dịch và bảo mật", "Bạn cần kiểm tra kỹ thông tin người nhận trước khi xác nhận giao dịch, dù Timi luôn cung cấp các lớp bảo vệ phù hợp.", "bottom", 3),
        ("mission", "article", "Vì sao Timi tồn tại", "Timi giúp mọi người hiểu tài chính dễ hơn, nhận diện rủi ro sớm hơn và chủ động hơn trong từng quyết định.", "top", 1),
        ("mission", "review", "An toàn trước tiên", "Bảo vệ tiền bạc, dữ liệu và sự bình yên của người dùng là ưu tiên trong mọi trải nghiệm Timi.", "middle", 2),
        ("mission", "review", "Minh bạch và đồng hành", "Timi giải thích cảnh báo rõ ràng, tôn trọng quyền lựa chọn và đặt người dùng ở vị trí chủ động.", "middle", 3),
        ("mission", "article", "Cam kết của Timi", "Phát hiện dấu hiệu lừa đảo, bảo vệ dữ liệu, thiết kế sản phẩm dễ dùng và liên tục lắng nghe phản hồi.", "bottom", 4),
        ("services", "article", "Dịch vụ Timi", "Chuyển tiền, thanh toán QR, quản lý chi tiêu và các lớp bảo vệ AI được thiết kế trong một trải nghiệm thống nhất.", "middle", 1),
        ("help", "article", "Làm sao để đổi mật khẩu?", "Vào Tài khoản, chọn Bảo mật tài khoản rồi nhập mật khẩu hiện tại và mật khẩu mới.", "top", 1),
        ("help", "article", "Quên mã PIN giao dịch phải làm gì?", "Vào Tài khoản > Thay đổi mã PIN để cập nhật PIN sau khi xác thực.", "middle", 2),
        ("help", "article", "Tại sao giao dịch cần xác minh khuôn mặt?", "Đây là lớp bảo vệ giúp xác nhận đúng chủ tài khoản trước các thao tác nhạy cảm.", "middle", 3),
        ("help", "article", "Cần hỗ trợ trực tiếp thì liên hệ ở đâu?", "Bạn có thể gửi email cho admin hoặc sử dụng thông tin liên hệ được hiển thị trong ứng dụng.", "bottom", 4),
    ]
    op.bulk_insert(content, [{"id": uuid.uuid4(), "page_key": page, "content_type": kind, "title": title, "body": body, "image_url": None, "placement": placement, "is_published": True, "sort_order": order} for page, kind, title, body, placement, order in rows])


def downgrade() -> None:
    schema = get_settings().database_schema
    op.execute(sa.text(f"DELETE FROM {schema}.content_items WHERE page_key IN ('privacy', 'terms', 'mission', 'services', 'help')"))
