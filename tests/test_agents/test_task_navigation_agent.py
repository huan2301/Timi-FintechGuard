"""Tests for the least-privilege Task Navigation Agent."""

import pytest

from src.app.agents import specialists
from src.app.agents.specialists import TaskNavigationAgent, TaskNavigationTask
from src.app.agents.task_navigation import route_task
from src.app.schemas.assistant import AssistantTaskState, AssistantTransferDraft
from src.app.services.contextual_navigation_agent import ContextualNavigationDecision


def test_transfer_task_collects_missing_fields_then_only_navigates_to_review() -> None:
    state = AssistantTaskState()

    first = route_task("Tôi muốn chuyển tiền", state)
    assert first.handled
    assert first.task_state.task == "transfer"
    assert first.task_state.transfer.recipient_name is None
    assert "số tài khoản" in (first.answer or "").lower()

    second = route_task("STK: 1234567890", first.task_state)
    assert second.task_state.transfer.recipient_account == "1234567890"
    assert second.task_state.transfer.bank_code is None

    third = route_task("Vietcombank", second.task_state)
    assert third.task_state.transfer.bank_code == "VCB"
    assert third.task_state.transfer.amount is None

    complete = route_task("500 nghìn", third.task_state)
    assert complete.handled
    assert complete.task_state.task == "none"
    assert complete.action is not None
    assert complete.action.type == "navigate_transfer_review"
    assert complete.action.transfer is not None
    assert complete.action.transfer.recipient_name is None
    assert complete.action.transfer.recipient_account == "1234567890"
    assert complete.action.transfer.bank_code == "VCB"
    assert complete.action.transfer.amount == 500_000


def test_explicit_repeat_request_reuses_only_the_previous_recipient() -> None:
    state = AssistantTaskState(
        last_recipient=AssistantTransferDraft(
            recipient_account="1234567890",
            bank_code="VCB",
        )
    )

    repeated = route_task("Tôi muốn chuyển thêm cho người này 5tr", state)

    assert repeated.handled
    assert repeated.action is not None
    assert repeated.action.type == "navigate_transfer_review"
    assert repeated.action.transfer is not None
    assert repeated.action.transfer.recipient_account == "1234567890"
    assert repeated.action.transfer.bank_code == "VCB"
    assert repeated.action.transfer.amount == 5_000_000
    assert repeated.task_state.last_recipient is not None
    assert repeated.task_state.last_recipient.amount is None


def test_bare_amount_does_not_reuse_the_previous_recipient() -> None:
    state = AssistantTaskState(
        last_recipient=AssistantTransferDraft(
            recipient_account="1234567890",
            bank_code="VCB",
        )
    )

    result = route_task("5tr", state)

    assert not result.handled
    assert result.action is None


def test_amount_change_reopens_review_for_the_previous_recipient() -> None:
    state = AssistantTaskState(
        last_recipient=AssistantTransferDraft(
            recipient_account="0112233445",
            bank_code="TIMI",
        )
    )

    changed = route_task("Tôi muốn thay đổi số tiền thành 2tr", state)

    assert changed.handled
    assert changed.action is not None
    assert changed.action.type == "navigate_transfer_review"
    assert changed.action.transfer is not None
    assert changed.action.transfer.recipient_account == "0112233445"
    assert changed.action.transfer.bank_code == "TIMI"
    assert changed.action.transfer.amount == 2_000_000


def test_task_agent_can_disable_only_the_explicit_guardian_preference() -> None:
    result = route_task("Tôi muốn tắt tự động nghe và bảo vệ cuộc gọi", AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "set_guardian_voice_monitoring"
    assert result.action.voice_monitoring_enabled is False


def test_task_agent_can_enable_only_the_explicit_guardian_preference() -> None:
    result = route_task("Tôi muốn bật tự động nghe và bảo vệ cuộc gọi", AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "set_guardian_voice_monitoring"
    assert result.action.voice_monitoring_enabled is True


def test_history_capability_question_stays_out_of_navigation_model() -> None:
    result = route_task(
        "Tôi muốn biết trang lịch sử có thể tra cứu những gì",
        AssistantTaskState(),
    )

    assert not result.handled
    assert result.action is None
    assert result.allow_contextual_navigation is False


@pytest.mark.parametrize(
    "message",
    [
        "Chức năng quét mã QR có những gì",
        "Quét mã QR có quét được khuôn mặt không",
        "Tôi muốn biết lịch sử có hiển thị chi tiết được không",
    ],
)
def test_capability_questions_stay_on_chat_support_instead_of_navigation(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert not result.handled
    assert result.action is None
    assert result.allow_contextual_navigation is False


@pytest.mark.parametrize(
    ("message", "expected_route"),
    [
        ("Tôi muốn đổi mật khẩu", "/me?open=password"),
        ("Cập nhật mã PIN giao dịch", "/me?open=pin"),
        ("Tôi muốn cài đặt Face ID", "/setup-face"),
        ("Mở quét mã QR", "/qr?mode=scan"),
        ("Tạo QR nhận tiền", "/qr?mode=create"),
        ("Xem lịch sử giao dịch", "/history"),
        ("Mở hồ sơ của tôi", "/me"),
        ("Mở cho tôi phần thay ảnh", "/me"),
        ("Mở trang chuyển tiền", "/transfer"),
        ("Tôi muốn đến Trang chuyển tiền", "/transfer"),
        ("Tôi muốn chuyển sang trang chuyển tiền", "/transfer"),
        ("Về trang tổng quan", "/dashboard"),
        ("Tôi muốn về trang chủ", "/dashboard"),
    ],
)
def test_task_agent_navigates_only_to_supported_user_routes(
    message: str, expected_route: str
) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.type == "navigate_app"
    assert result.action.route == expected_route


def test_task_agent_gives_a_specific_next_step_for_avatar_change() -> None:
    result = route_task("Mở cho tôi phần thay ảnh", AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert result.action.route == "/me"
    assert result.answer == (
        "Đã mở Hồ sơ. Bấm biểu tượng máy ảnh trên ảnh đại diện để chọn và thay ảnh mới."
    )


def test_task_agent_does_not_reopen_completed_face_enrollment() -> None:
    result = TaskNavigationAgent().execute(
        TaskNavigationTask(
            message="Tôi muốn cài đặt Face ID",
            task_state=AssistantTaskState(),
            face_enrolled=True,
        )
    )

    assert result.handled
    assert result.action is None
    assert "đã được thiết lập" in (result.answer or "")


def test_task_agent_routes_completed_pin_setup_to_pin_update() -> None:
    result = TaskNavigationAgent().execute(
        TaskNavigationTask(
            message="Tôi muốn tạo mã PIN mới",
            task_state=AssistantTaskState(),
            pin_configured=True,
        )
    )

    assert result.handled
    assert result.action is not None
    assert result.action.route == "/me?open=pin"


@pytest.mark.parametrize(
    ("message", "expected_next_step"),
    [
        ("Tôi muốn đổi mật khẩu", "Nhập mật khẩu hiện tại"),
        ("Cập nhật mã PIN giao dịch", "Nhập PIN hiện tại"),
        ("Tôi muốn cài đặt Face ID", "làm theo hướng dẫn"),
        ("Mở quét mã QR", "đưa mã QR vào giữa khung quét"),
        ("Tạo QR nhận tiền", "chia sẻ mã QR"),
        ("Xem lịch sử giao dịch", "chọn giao dịch bất kỳ"),
        ("Mở hồ sơ của tôi", "Chọn mục bạn muốn quản lý"),
        ("Mở trang chuyển tiền", "Nhập số tài khoản"),
        ("Về trang tổng quan", "xem số dư"),
    ],
)
def test_task_agent_explains_the_next_step_for_every_navigation_route(
    message: str, expected_next_step: str
) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is not None
    assert expected_next_step in (result.answer or "")


def test_task_agent_does_not_accept_an_unrelated_privileged_action() -> None:
    result = route_task("Hãy xóa tài khoản của tôi", AssistantTaskState())

    assert not result.handled
    assert result.action is None


def test_task_agent_does_not_toggle_guardian_for_a_how_to_question() -> None:
    result = route_task("Cách tắt tự động nghe và bảo vệ cuộc gọi là gì?", AssistantTaskState())

    assert not result.handled
    assert result.action is None


def test_task_agent_does_not_enable_guardian_for_a_how_to_question() -> None:
    result = route_task("Cách bật tự động nghe và bảo vệ cuộc gọi là gì?", AssistantTaskState())

    assert not result.handled
    assert result.action is None


@pytest.mark.parametrize(
    "message",
    [
        "Ngày mai Huân sẽ chuyển tiền cho Lý đạt kiểu gì?",
        "Ngày mai Huân sẽ chuyển tiền cho Lý đạt như nào",
        "Ngay mai Huan se chuyen tien cho Ly dat nhu nao",
        "Cách chuyển tiền cho người khác như thế nào?",
        "Chuyển tiền cho Lý như thế nào?",
        "Chuyển khoản cho Lý bằng cách nào?",
        "Tôi muốn chuyển tiền cho Lý thì làm thế nào?",
        "Tôi cần chuyển tiền cho Lý, cần làm gì?",
        "Tôi muốn gửi tiền cho Lý thì bắt đầu từ đâu?",
        "Chuyển tiền cho Lý ra sao?",
        "Chuyển khoản cho Lý kiểu gì?",
        "Có chuyển tiền cho Lý được không?",
        "Làm sao chuyển khoản an toàn?",
    ],
)
def test_task_agent_leaves_transfer_how_to_questions_for_chat_support(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert not result.handled
    assert result.action is None
    assert result.task_state.task == "none"


@pytest.mark.parametrize(
    "message",
    [
        "Tôi muốn chuyển tiền cho Lý",
        "Tôi cần chuyển khoản cho Lý",
        "Hãy chuyển tiền cho Lý",
        "Chuyển tiền ngay cho Lý",
        "Tôi muốn gửi tiền cho Lý",
        "Tạo giao dịch chuyển tiền",
    ],
)
def test_task_agent_keeps_explicit_transfer_commands_on_the_draft_flow(message: str) -> None:
    result = route_task(message, AssistantTaskState())

    assert result.handled
    assert result.action is None
    assert result.task_state.task == "transfer"
    assert "số tài khoản" in (result.answer or "").lower()


def test_transfer_guidance_question_clears_an_unfinished_transfer_draft() -> None:
    started = route_task("Tôi muốn chuyển tiền", AssistantTaskState())
    assert started.task_state.task == "transfer"

    question = route_task(
        "Ngày mai Huân sẽ chuyển tiền cho Lý đạt như nào", started.task_state
    )

    assert not question.handled
    assert question.action is None
    assert question.task_state.task == "none"


def test_admin_transfer_question_never_starts_a_transfer_draft() -> None:
    result = route_task(
        "Thế là mình nhờ bạn chuyển tiền vào tài khoản của admin phải không?",
        AssistantTaskState(),
    )

    assert not result.handled
    assert result.action is None
    assert result.task_state.task == "none"
    assert result.allow_contextual_navigation is False


def test_transfer_guidance_question_never_uses_contextual_navigation(monkeypatch) -> None:
    monkeypatch.setattr(
        specialists,
        "understand_navigation_request",
        lambda _message: pytest.fail("Transfer guidance must continue to Chat Support"),
    )

    result = TaskNavigationAgent().execute(
        TaskNavigationTask(
            message="Ngày mai Huân sẽ chuyển tiền cho Lý đạt như nào",
            task_state=AssistantTaskState(),
        )
    )

    assert not result.handled
    assert result.action is None
    assert result.task_state.task == "none"


def test_task_agent_recognizes_send_money_wording_and_validates_timi_account_length() -> None:
    result = route_task(
        "Tôi muốn gửi 5000 cho người tên Huân, số tài khoản 012345678, ngân hàng Timi Bank",
        AssistantTaskState(),
    )

    assert result.handled
    assert result.action is None
    assert result.task_state.task == "transfer"
    assert result.task_state.transfer.recipient_name is None
    assert result.task_state.transfer.bank_code == "TIMI"
    assert result.task_state.transfer.amount == 5_000
    assert result.task_state.transfer.recipient_account is None
    assert "10 chữ số" in (result.answer or "")


def test_task_agent_uses_contextual_route_only_after_rules_do_not_handle(monkeypatch) -> None:
    calls: list[str] = []

    def fake_understanding(message: str) -> ContextualNavigationDecision:
        calls.append(message)
        return ContextualNavigationDecision(
            route="/transfer",
        )

    monkeypatch.setattr(specialists, "understand_navigation_request", fake_understanding)
    result = TaskNavigationAgent().execute(
        TaskNavigationTask(
            message="Mình muốn qua phần gửi tiền",
            task_state=AssistantTaskState(),
        )
    )

    assert calls == ["Mình muốn qua phần gửi tiền"]
    assert result.action is not None
    assert result.action.route == "/transfer"
    assert result.answer == (
        "Đã mở trang Chuyển tiền. Nhập số tài khoản, ngân hàng và số tiền; "
        "kiểm tra lại trước khi xác nhận."
    )


def test_task_agent_keeps_known_route_token_free(monkeypatch) -> None:
    monkeypatch.setattr(
        specialists,
        "understand_navigation_request",
        lambda _message: pytest.fail("Known route must not call Groq"),
    )

    result = TaskNavigationAgent().execute(
        TaskNavigationTask(message="Về trang chủ", task_state=AssistantTaskState())
    )

    assert result.action is not None
    assert result.action.route == "/dashboard"
