"""expand Vietnamese public page content with illustrations"""

from collections.abc import Sequence
import uuid
import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings

revision: str = "u8v9w0x1y2z3"
down_revision: str | Sequence[str] | None = "t7u8v9w0x1y2"
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
    assets = "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/"
    rows = [
        ("privacy", "image", "Bảo vệ dữ liệu nhiều lớp", "Mỗi lớp bảo vệ được thiết kế để giảm rủi ro và tăng quyền kiểm soát cho người dùng.", assets + "45.jpg", "top", 10),
        ("privacy", "article", "Minh bạch trong sử dụng dữ liệu", "Timi chỉ sử dụng dữ liệu trong phạm vi cần thiết cho xác thực, cảnh báo rủi ro và vận hành dịch vụ. Bạn có thể liên hệ để kiểm tra hoặc cập nhật thông tin của mình.", None, "middle", 11),
        ("privacy", "article", "Thời gian lưu trữ và xóa dữ liệu", "Dữ liệu được lưu trong thời gian cần thiết cho mục đích bảo mật và tuân thủ. Khi không còn cần thiết, dữ liệu sẽ được xử lý theo chính sách lưu trữ của hệ thống.", None, "bottom", 12),
        ("terms", "image", "Sử dụng Timi an toàn và đúng mục đích", "Hãy bảo mật mật khẩu, mã PIN, OTP và không chia sẻ dữ liệu xác thực cho bất kỳ ai.", assets + "44.png", "top", 10),
        ("terms", "article", "Trách nhiệm khi giao dịch", "Người dùng cần kiểm tra người nhận, số tiền và nội dung giao dịch trước khi xác nhận. Timi có thể tạm dừng giao dịch có dấu hiệu bất thường để bảo vệ tài khoản.", None, "middle", 11),
        ("terms", "article", "Kênh hỗ trợ chính thức", "Chỉ sử dụng thông tin liên hệ được hiển thị trong ứng dụng. Timi không yêu cầu cung cấp mật khẩu, OTP hoặc PIN qua cuộc gọi và tin nhắn.", None, "bottom", 12),
        ("mission", "image", "Công nghệ vì con người", "Công nghệ chỉ có ý nghĩa khi giúp người dùng hiểu rõ hơn và đưa ra quyết định an toàn hơn.", assets + "40.png", "top", 10),
        ("mission", "review", "Một lớp bảo vệ chủ động", "Timi kết hợp AI, dữ liệu cảnh báo và xác thực nhiều lớp để đồng hành cùng người dùng trong từng giao dịch.", assets + "44.png", "middle", 11),
        ("mission", "article", "Đo lường bằng sự an tâm", "Chúng tôi liên tục cải thiện tốc độ cảnh báo, tính minh bạch và khả năng kiểm soát để trải nghiệm tài chính trở nên dễ tiếp cận hơn.", None, "bottom", 12),
        ("services", "image", "Các lớp dịch vụ trong một trải nghiệm", "Từ chuyển tiền, thanh toán QR đến bảo vệ giao dịch, Timi kết nối các tiện ích tài chính trong một không gian thống nhất.", assets + "32.jpg", "top", 10),
        ("services", "article", "Bảo vệ trước khi xác nhận", "AI Anti-Scam phân tích tín hiệu rủi ro và đưa ra cảnh báo để bạn có thêm thời gian kiểm tra trước khi tiền được chuyển đi.", None, "middle", 11),
        ("help", "image", "Luôn có nơi để tìm hỗ trợ", "Bạn có thể xem câu hỏi thường gặp hoặc liên hệ với admin bằng thông tin chính thức trong ứng dụng.", assets + "43.png", "top", 10),
        ("help", "article", "Làm sao để đăng ký và xác minh email?", "Nhập thông tin đăng ký, kiểm tra email để lấy mã xác minh 6 số, sau đó nhập mã vào sáu ô xác minh trên màn hình đăng ký.", None, "middle", 11),
        ("help", "article", "Làm gì khi nhận cảnh báo rủi ro cao?", "Tạm dừng giao dịch, kiểm tra lại người nhận bằng một kênh độc lập và không cung cấp OTP, PIN hoặc ảnh khuôn mặt cho người khác.", None, "bottom", 12),
    ]
    op.bulk_insert(content, [{"id": uuid.uuid4(), "page_key": page, "content_type": kind, "title": title, "body": body, "image_url": image, "placement": placement, "is_published": True, "sort_order": order} for page, kind, title, body, image, placement, order in rows])


def downgrade() -> None:
    schema = get_settings().database_schema
    op.execute(sa.text(f"DELETE FROM {schema}.content_items WHERE sort_order >= 10 AND page_key IN ('privacy', 'terms', 'mission', 'services', 'help')"))
