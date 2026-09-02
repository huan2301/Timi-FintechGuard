from types import SimpleNamespace

from src.app.agents.contracts import ChatIntent
from src.app.schemas.assistant import AssistantChatTurn, AssistantTaskState
from src.app.services import chat_intent


def test_chat_support_front_door_selects_bounded_domains_without_provider(monkeypatch) -> None:
    monkeypatch.setattr(
        chat_intent,
        "get_settings",
        lambda: SimpleNamespace(
            chat_agent_api_key="",
            chat_agent_api_keys="",
            chat_agent_base_url="",
            chat_agent_model="",
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
            assistant_chat_max_completion_tokens=640,
        ),
    )

    state = AssistantTaskState()
    assert chat_intent.classify_chat_intent("Tôi muốn chuyển tiền cho Huân", state, []).intent == ChatIntent.TRANSFER
    assert chat_intent.classify_chat_intent("Mở trang chuyển tiền", state, []).intent == ChatIntent.NAVIGATION
    assert chat_intent.classify_chat_intent("QR có quét được khuôn mặt không?", state, []).intent == ChatIntent.QUESTION
    assert (
        chat_intent.classify_chat_intent("Tôi muốn tắt bảo vệ cuộc gọi", state, []).intent
        == ChatIntent.GUARDIAN_PREFERENCE
    )
    assert chat_intent.classify_chat_intent("hi", state, []).intent == ChatIntent.QUESTION
    assert chat_intent.classify_chat_intent("không có câu nào", state, []).intent == ChatIntent.QUESTION
    assert chat_intent.classify_chat_intent("Thời tiết hôm nay", state, []).intent == ChatIntent.OUT_OF_SCOPE


def test_front_door_keeps_transfer_follow_up_under_transfer_agent(monkeypatch) -> None:
    monkeypatch.setattr(
        chat_intent,
        "get_settings",
        lambda: SimpleNamespace(
            chat_agent_api_key="",
            chat_agent_api_keys="",
            chat_agent_base_url="",
            chat_agent_model="",
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    started = chat_intent.classify_chat_intent(
        "Tôi muốn chuyển tiền",
        AssistantTaskState(),
        [],
    )

    follow_up = chat_intent.classify_chat_intent(
        "0123456789",
        started.task_state,
        [AssistantChatTurn(role="user", content="Tôi muốn chuyển tiền")],
    )
    assert follow_up.intent == ChatIntent.TRANSFER
    assert follow_up.task_state.task == "transfer"


def test_ambiguous_message_uses_strict_model_label(monkeypatch) -> None:
    monkeypatch.setattr(
        chat_intent,
        "get_settings",
        lambda: SimpleNamespace(
            chat_agent_api_key="chat-key",
            chat_agent_api_keys="",
            chat_agent_base_url="https://example.test/v1",
            chat_agent_model="small-chat",
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
            assistant_chat_max_completion_tokens=640,
        ),
    )

    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **request: object) -> object:
            captured.update(request)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content='{"intent":"navigation"}'))]
            )

    class FakeOpenAI:
        def __init__(self, **_kwargs: object) -> None:
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(chat_intent, "OpenAI", FakeOpenAI)
    result = chat_intent.classify_chat_intent(
        "Giao diện tiền cho tôi",
        AssistantTaskState(),
        [],
    )

    assert result.intent == ChatIntent.NAVIGATION
    assert result.source == "model"
    assert captured["response_format"] == {"type": "json_object"}
