"""Context matrix for Timi's chat/task boundary.

These cases model short, noisy and multi-turn messages seen in the UI. The
tests intentionally exercise the boundary between product support and actions:
questions must stay in Chat Support, while only explicit transaction commands
may build a review draft.
"""

import pytest

from src.app.agents.task_navigation import route_task
from src.app.schemas.assistant import AssistantTaskState
from src.app.services.timi_assistant import (
    ADMIN_POLICY_ANSWER,
    ADMIN_TRANSFER_ANSWER,
    SENSITIVE_CREDENTIAL_ANSWER,
    answer_timi_question,
)

ADMIN_POLICY_MESSAGES = [
    "Admin có những quyền gì?",
    "Admin được phép xem dữ liệu khách hàng không?",
    "Quản trị viên có được xem tài khoản khách hàng không?",
    "Admin có thể scam tài khoản khách hàng không?",
    "Admin là ai trong Timi?",
    "Quyền của admin là gì?",
    "Admin được lấy tiền khách hàng không?",
    "admin co quyen gi",
    "quan tri vien co duoc phep xem du lieu khach hang khong",
    "Admin có chiếm quyền tài khoản không?",
    "Admin được phép truy cập dữ liệu khách hàng à?",
    "admin có quyền xem lịch sử giao dịch của tôi không?",
]


@pytest.mark.parametrize("message", ADMIN_POLICY_MESSAGES)
def test_admin_policy_context_has_a_safe_complete_answer(message: str) -> None:
    answer, out_of_scope = answer_timi_question(message, [])

    assert answer == ADMIN_POLICY_ANSWER
    assert not out_of_scope
    assert "OTP" in answer
    assert "chuyển tiền" in answer


ADMIN_TRANSFER_MESSAGES = [
    "Thế là mình nhờ bạn chuyển tiền vào tài khoản của admin phải không?",
    "Chuyển khoản cho admin 100.000 đồng",
    "Gửi tiền cho admin có an toàn không?",
    "Gửi admin 50k",
    "Chuyển vào tài khoản admin nhé",
    "Nạp tiền cho admin để kích hoạt",
    "Thanh toán cho admin",
    "chuyen tien vao tai khoan admin phai khong",
    "Chuyển khoản cho quản trị viên",
    "Gửi vào admin",
    "Chuyển tiền vào tài khoản của quản trị viên",
    "Mình có phải nạp tiền vào admin để kích hoạt không?",
]


@pytest.mark.parametrize("message", ADMIN_TRANSFER_MESSAGES)
def test_admin_transfer_context_never_collects_recipient_data(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert not result.handled
    assert result.action is None
    assert result.task_state.task == "none"
    assert result.allow_contextual_navigation is False

    answer, out_of_scope = answer_timi_question(message, [])
    assert answer == ADMIN_TRANSFER_ANSWER
    assert not out_of_scope


TRANSFER_GUIDANCE_MESSAGES = [
    "Tôi không hiểu cách chuyển tiền",
    "Cách chuyển khoản cho người khác như thế nào?",
    "Có thể chuyển tiền bằng QR không?",
    "Có phải chuyển tiền trước không?",
    "Chuyển tiền cho ai thì được?",
    "Chuyển tiền cho Lý cần gì?",
    "Tôi phải làm gì để chuyển tiền?",
    "Chuyển tiền có an toàn không?",
    "Tôi không biết chuyển tiền",
    "Hướng dẫn tôi chuyển khoản",
    "Chuyển tiền được không?",
    "Chuyển tiền cho Lý kiểu gì?",
    "Ngày mai Huân sẽ chuyển tiền cho Lý đạt như nào",
    "Tài khoản nào nhận tiền chuyển khoản?",
    "Chuyển tiền bao nhiêu là được?",
]


@pytest.mark.parametrize("message", TRANSFER_GUIDANCE_MESSAGES)
def test_transfer_questions_stay_in_chat_support(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert not result.handled
    assert result.action is None
    assert result.task_state.task == "none"
    assert result.allow_contextual_navigation is False


EXPLICIT_TRANSFER_MESSAGES = [
    "Tôi muốn chuyển tiền",
    "Tôi cần chuyển khoản cho Lý",
    "Hãy chuyển tiền cho Lý",
    "Chuyển tiền ngay cho Lý",
    "Tôi muốn gửi tiền cho Lý",
    "Tạo giao dịch chuyển tiền",
    "Tôi muốn chuyển 500 nghìn cho Lý",
    "Chuyển khoản 1 triệu cho người thân",
    "Chuyển 500.000đ tới số tài khoản 1234567890",
    "Tôi cần gửi 50k cho bạn",
]


@pytest.mark.parametrize("message", EXPLICIT_TRANSFER_MESSAGES)
def test_explicit_transfer_context_starts_a_bounded_draft(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is None
    assert result.task_state.task == "transfer"
    assert "số tài khoản" in (result.answer or "").lower()


NAVIGATION_CASES = [
    ("Mở trang đổi mật khẩu", "/me?open=password"),
    ("Tôi cần cập nhật mật khẩu", "/me?open=password"),
    ("Mở phần PIN giao dịch", "/me?open=pin"),
    ("Tạo mã PIN mới", "/setup-pin"),
    ("Cài đặt khuôn mặt", "/setup-face"),
    ("Mở quét mã QR", "/qr?mode=scan"),
    ("Tạo mã QR nhận tiền", "/qr?mode=create"),
    ("Mở lịch sử giao dịch", "/history"),
    ("Mở hồ sơ tài khoản", "/me"),
    ("Mở cho tôi phần thay ảnh", "/me"),
    ("Đưa tôi đến trang chuyển tiền", "/transfer"),
    ("Sang màn hình chuyển tiền", "/transfer"),
    ("Vào phần chuyển tiền", "/transfer"),
    ("Về trang chủ", "/dashboard"),
    ("Mở màn hình chính", "/dashboard"),
    ("Quay lại trang tổng quan", "/dashboard"),
    ("Mở điều khoản sử dụng", "/terms"),
    ("Xem chính sách bảo mật dữ liệu", "/privacy"),
    ("Đưa tôi đến trang sứ mệnh", "/mission"),
    ("Mở trung tâm trợ giúp", "/help"),
    ("Xem câu hỏi thường gặp", "/help"),
]


@pytest.mark.parametrize(("message", "expected_route"), NAVIGATION_CASES)
def test_navigation_context_uses_only_the_expected_allowlisted_route(message: str, expected_route: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "navigate_app"
    assert result.action.route == expected_route


FULL_TRANSFER_CASES = [
    ("Chuyển 500.000đ đến STK 1234567890 tại Vietcombank", "1234567890", "VCB", 500_000),
    ("Gửi 1 triệu vào số tài khoản 987654321, ngân hàng BIDV", "987654321", "BIDV", 1_000_000),
    ("chuyen 50k toi 1234567890 ngan hang acb", "1234567890", "ACB", 50_000),
    ("Tạo giao dịch, STK: 123456789, Techcombank, số tiền 2 triệu", "123456789", "TCB", 2_000_000),
]


@pytest.mark.parametrize(("message", "account", "bank", "amount"), FULL_TRANSFER_CASES)
def test_full_transfer_context_only_opens_review_with_all_three_slots(
    message: str, account: str, bank: str, amount: int
) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "navigate_transfer_review"
    assert result.action.transfer is not None
    assert result.action.transfer.recipient_account == account
    assert result.action.transfer.bank_code == bank
    assert result.action.transfer.amount == amount
    assert result.task_state.task == "none"


def test_transfer_context_allows_correcting_account_before_review() -> None:
    started = route_task("Tôi muốn chuyển tiền", AssistantTaskState())
    with_account = route_task("STK: 1234567890", started.task_state)
    corrected = route_task("Không, số tài khoản đúng là 9876543210", with_account.task_state)

    assert corrected.task_state.transfer.recipient_account == "9876543210"
    assert corrected.task_state.task == "transfer"
    assert corrected.action is None


def test_transfer_context_allows_correcting_bank_before_review() -> None:
    state = AssistantTaskState(
        task="transfer",
        transfer={
            "recipient_account": "1234567890",
            "bank_code": "VCB",
            "amount": 500_000,
        },
    )
    corrected = route_task("Không, dùng BIDV", state)

    assert corrected.action is not None
    assert corrected.action.type == "navigate_transfer_review"
    assert corrected.action.transfer is not None
    assert corrected.action.transfer.bank_code == "BIDV"


def test_transfer_context_allows_correcting_amount_before_review() -> None:
    state = AssistantTaskState(
        task="transfer",
        transfer={
            "recipient_account": "1234567890",
            "bank_code": "VCB",
            "amount": 500_000,
        },
    )
    corrected = route_task("Không, chuyển 2 triệu thôi", state)

    assert corrected.action is not None
    assert corrected.action.type == "navigate_transfer_review"
    assert corrected.action.transfer is not None
    assert corrected.action.transfer.amount == 2_000_000


def test_transfer_question_clears_old_draft_before_chat_support() -> None:
    started = route_task("Tôi muốn chuyển tiền", AssistantTaskState())
    question = route_task("Có thể chuyển tiền bằng QR không?", started.task_state)

    assert not question.handled
    assert question.task_state.task == "none"
    assert question.allow_contextual_navigation is False


@pytest.mark.parametrize(
    "message",
    [
        "Mã PIN: 123456",
        "OTP 987654",
        "Mật khẩu: 12345678",
        "password=abc12345",
    ],
)
def test_sensitive_credential_context_never_reaches_a_model(
    message: str,
) -> None:
    answer, out_of_scope = answer_timi_question(message, [])

    assert answer == SENSITIVE_CREDENTIAL_ANSWER
    assert not out_of_scope


@pytest.mark.parametrize(
    ("message", "expected_fragment"),
    [
        ("Tôi muốn chuyển tiền", "số tài khoản"),
        ("STK: 1234567890", "ngân hàng"),
        ("Vietcombank", "bao nhiêu tiền"),
    ],
)
def test_transfer_context_asks_for_exactly_the_next_missing_slot(message: str, expected_fragment: str) -> None:
    state = AssistantTaskState()
    if message != "Tôi muốn chuyển tiền":
        state = route_task("Tôi muốn chuyển tiền", state).task_state
    if message == "Vietcombank":
        state = route_task("STK: 1234567890", state).task_state

    result = (
        route_task(message, state) if message != "Tôi muốn chuyển tiền" else route_task(message, AssistantTaskState())
    )

    assert result.handled
    assert expected_fragment in (result.answer or "").lower()
