"""expand legal copy and distribute illustrations across public content"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from src.app.config import get_settings


revision: str = "z3a4b5c6d7e8"
down_revision: str | Sequence[str] | None = "y2z3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UPDATES = {
    "Dữ liệu được thu thập": "Timi chỉ thu thập thông tin cần thiết cho việc tạo tài khoản, xác thực danh tính, xử lý giao dịch, gửi cảnh báo và cải thiện chất lượng dịch vụ. Những dữ liệu này được sử dụng đúng mục đích, có giới hạn truy cập và không được bán cho bên thứ ba để quảng cáo.",
    "Dữ liệu khuôn mặt": "Dữ liệu khuôn mặt chỉ được tạo và sử dụng khi bạn chủ động đăng ký hoặc xác minh. Timi lưu thông tin ở dạng phục vụ xác thực, áp dụng kiểm soát truy cập và không dùng dữ liệu này để theo dõi, quảng cáo hoặc nhận diện ngoài phạm vi bạn đã cho phép.",
    "Mục đích sử dụng": "Dữ liệu có thể được dùng để xác minh chủ tài khoản, phát hiện dấu hiệu bất thường, bảo vệ giao dịch, hỗ trợ khôi phục quyền truy cập và liên hệ khi có vấn đề quan trọng. Timi chỉ xử lý dữ liệu phù hợp với mục đích đã thông báo và hạn chế việc sử dụng ngoài phạm vi cần thiết.",
    "Bảo vệ dữ liệu": "Timi kết hợp mã hóa, phân quyền, nhật ký hoạt động và các lớp xác thực như mật khẩu, PIN, OTP và khuôn mặt để hạn chế truy cập trái phép. Dù vậy, người dùng vẫn cần bảo vệ thiết bị, không chia sẻ mã xác minh và thông báo ngay khi phát hiện dấu hiệu bất thường.",
    "Quyền của bạn": "Bạn có quyền yêu cầu xem, cập nhật, điều chỉnh hoặc xóa thông tin cá nhân theo quy trình hỗ trợ của Timi. Khi gửi yêu cầu, Timi có thể cần xác minh danh tính để bảo vệ tài khoản và phản hồi trong thời gian hợp lý theo tính chất của từng yêu cầu.",
    "Chấp nhận điều khoản": "Bằng việc tạo tài khoản hoặc sử dụng Timi, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản sử dụng này. Nếu không đồng ý với bất kỳ nội dung nào, bạn nên dừng sử dụng dịch vụ và liên hệ hỗ trợ để được giải đáp trước khi tiếp tục.",
    "Tài khoản người dùng": "Bạn có trách nhiệm cung cấp thông tin chính xác, cập nhật thông tin khi có thay đổi và bảo mật email, mật khẩu, PIN, OTP cùng dữ liệu xác thực khuôn mặt. Mọi hoạt động phát sinh từ tài khoản có thể được xem là do bạn thực hiện cho đến khi Timi nhận được thông báo hợp lệ về việc mất quyền kiểm soát.",
    "Sử dụng dịch vụ": "Bạn chỉ sử dụng Timi cho mục đích hợp pháp, không can thiệp vào hệ thống, không tìm cách vượt qua lớp bảo vệ và không dùng dịch vụ để thực hiện hành vi gian lận, lừa đảo hoặc gây thiệt hại cho người khác. Timi có thể tạm dừng hoạt động đáng ngờ để bảo vệ người dùng.",
    "Giao dịch và bảo mật": "Bạn cần kiểm tra kỹ người nhận, số tiền, nội dung và kênh xác nhận trước khi hoàn tất giao dịch. Các cảnh báo của Timi giúp bạn có thêm thông tin tham khảo nhưng không thay thế việc tự kiểm tra. Không cung cấp OTP, PIN, mật khẩu hoặc ảnh khuôn mặt cho bất kỳ ai qua cuộc gọi, tin nhắn hay đường link lạ.",
    "Thay đổi điều khoản": "Timi có thể cập nhật điều khoản để phù hợp với tính năng, yêu cầu bảo mật và quy định hiện hành. Phiên bản mới sẽ được công bố trên trang này; việc tiếp tục sử dụng dịch vụ sau thời điểm cập nhật được hiểu là bạn đã xem và chấp nhận nội dung thay đổi.",
}

IMAGES = {
    "Dữ liệu được thu thập": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396366/fintechguard/content/vixxqz9rin7qmxotkl0q.jpg",
    "Dữ liệu khuôn mặt": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396817/fintechguard/content/mission-purpose.jpg",
    "Bảo vệ dữ liệu": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396366/fintechguard/content/vixxqz9rin7qmxotkl0q.jpg",
    "Chấp nhận điều khoản": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396615/fintechguard/content/terms-guide.jpg",
    "Giao dịch và bảo mật": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396615/fintechguard/content/terms-guide.jpg",
    "Dịch vụ Timi": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396368/fintechguard/content/k0r8hguibbzypq2e48x5.jpg",
    "Làm sao để đổi mật khẩu?": "https://res.cloudinary.com/dduc9plv6/image/upload/v1787396617/fintechguard/content/help-support.jpg",
}


def upgrade() -> None:
    schema = get_settings().database_schema
    table = f"{schema}.content_items"
    connection = op.get_bind()
    for title, body in UPDATES.items():
        connection.execute(
            sa.text(f"UPDATE {table} SET body = :body WHERE title = :title"),
            {"body": body, "title": title},
        )
    for title, image_url in IMAGES.items():
        connection.execute(
            sa.text(f"UPDATE {table} SET image_url = :image_url WHERE title = :title"),
            {"image_url": image_url, "title": title},
        )


def downgrade() -> None:
    # Keep the richer copy and images when rolling back; the changes are content-safe.
    pass
