from types import SimpleNamespace

import src.app.services.timi_assistant as timi_assistant
from src.app.schemas.assistant import AssistantRiskContext
from src.app.services.timi_assistant import (
    ADMIN_POLICY_ANSWER,
    ADMIN_TRANSFER_ANSWER,
    GREETING_ANSWER,
    HISTORY_GUIDANCE_ANSWER,
    OUT_OF_SCOPE_ANSWER,
    SENSITIVE_CREDENTIAL_ANSWER,
    answer_timi_question,
    contains_sensitive_credential,
    is_in_scope,
    risk_coach_questions,
    risk_coach_reasoning_cues,
)


def test_timi_assistant_allows_product_questions() -> None:
    assert is_in_scope("Tôi quét QR bị chặn thì phải làm sao?")
    assert is_in_scope("Face ID cần bao nhiêu phần trăm để xác thực?")
    assert is_in_scope("Tôi không hiểu cách chuyển tiền")
    assert is_in_scope("Tôi muốn gửi tiền cho người thân")
    assert is_in_scope("Chính sách của hệ thống có những gì?")
    assert is_in_scope("Cho tôi xem điều khoản và quyền riêng tư")


def test_timi_assistant_rejects_unrelated_questions() -> None:
    assert not is_in_scope("Viết giúp tôi một bài thơ về biển")
    assert OUT_OF_SCOPE_ANSWER.startswith("Mình chỉ hỗ trợ")


def test_timi_assistant_answers_harmless_greetings_normally() -> None:
    assert is_in_scope("hi")
    answer, out_of_scope = answer_timi_question("hi", [])

    assert answer == GREETING_ANSWER
    assert not out_of_scope


def test_timi_assistant_answers_simple_conversation_normally() -> None:
    answer, out_of_scope = answer_timi_question("Bạn có thể giúp gì?", [])

    assert "chuyển tiền" in answer
    assert not out_of_scope


def test_conversation_close_is_allowed_to_reach_chat_support(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content="Không sao, Timi vẫn sẵn sàng khi bạn cần."
                        )
                    )
                ]
            )

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)
    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            chat_agent_api_key="chat-key",
            chat_agent_api_keys="",
            chat_agent_base_url="https://example.test/v1",
            chat_agent_model="chat-model",
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
            assistant_chat_max_completion_tokens=640,
        ),
    )

    answer, out_of_scope = answer_timi_question("không có câu nào", [])

    assert answer == "Không sao, Timi vẫn sẵn sàng khi bạn cần."
    assert not out_of_scope
    assert captured["model"] == "chat-model"


def test_timi_assistant_blocks_sensitive_credentials() -> None:
    assert contains_sensitive_credential("Mã PIN: 123456")
    assert contains_sensitive_credential("OTP 987654")
    assert "không bao giờ" in SENSITIVE_CREDENTIAL_ANSWER


def test_history_guidance_is_local_and_does_not_require_provider() -> None:
    answer, out_of_scope = answer_timi_question(
        "Tôi muốn biết trang lịch sử có thể tra cứu những gì", []
    )

    assert answer == HISTORY_GUIDANCE_ANSWER
    assert not out_of_scope
    assert "mã giao dịch" in answer
    assert "tìm theo tên hoặc số tài khoản" in answer


def test_timi_assistant_explains_admin_role_without_calling_provider() -> None:
    answer, out_of_scope = answer_timi_question(
        "Admin có những quyền gì? Scam được tài khoản khách hàng không?", []
    )

    assert answer == ADMIN_POLICY_ANSWER
    assert not out_of_scope


def test_timi_assistant_blocks_admin_transfer_assumption() -> None:
    answer, out_of_scope = answer_timi_question(
        "Thế là mình nhờ bạn chuyển tiền vào tài khoản của admin phải không?", []
    )

    assert answer == ADMIN_TRANSFER_ANSWER
    assert not out_of_scope


def test_timi_assistant_uses_groq_chat_completions(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Bạn có thể mở mục QR để quét mã."))]
            )

    class FakeChat:
        completions = FakeCompletions()

    class FakeOpenAI:
        def __init__(self, *, api_key: str, base_url: str):
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            self.chat = FakeChat()

    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            groq_api_key="test-key",
            groq_model_name="test-model",
            groq_base_url="https://example.test/openai/v1",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)

    answer, out_of_scope = timi_assistant.answer_timi_question("Tôi không hiểu cách chuyển tiền", [])

    assert answer == "Bạn có thể mở mục QR để quét mã."
    assert not out_of_scope
    assert captured["model"] == "test-model"
    assert captured["max_completion_tokens"] == 640
    assert captured["base_url"] == "https://example.test/openai/v1"
    assert captured["messages"][0] == {"role": "system", "content": timi_assistant._SYSTEM_INSTRUCTIONS}


def test_timi_assistant_uses_backup_key_only_after_rate_limit(monkeypatch) -> None:
    calls: list[str] = []

    class RateLimitError(RuntimeError):
        status_code = 429

    class FakeCompletions:
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key

        def create(self, **_kwargs):
            calls.append(self.api_key)
            if self.api_key == "primary-key":
                raise RateLimitError("rate limit")
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="Đã dùng key dự phòng."))]
            )

    class FakeOpenAI:
        def __init__(self, *, api_key: str, **_kwargs) -> None:
            self.chat = SimpleNamespace(completions=FakeCompletions(api_key))

    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            groq_api_key="",
            groq_model_name="test-model",
            groq_base_url="https://example.test/openai/v1",
            chat_agent_api_key="primary-key",
            chat_agent_api_keys="backup-key",
            chat_agent_base_url="",
            chat_agent_model="",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)

    answer, out_of_scope = timi_assistant.answer_timi_question("Tôi không hiểu cách chuyển tiền", [])

    assert calls == ["primary-key", "backup-key"]
    assert answer == "Đã dùng key dự phòng."
    assert not out_of_scope


def test_risk_coach_links_reward_note_to_only_supported_scam_cue() -> None:
    context = AssistantRiskContext(
        transaction_id="00000000-0000-0000-0000-000000000001",
        recipient_account_masked="***3445",
        note="Nhận thưởng vé máy bay sang Mỹ",
        risk_level="high",
        risk_score=0.98,
        signals=["Tài khoản ***3445 đã được đánh dấu cần thận trọng."],
    )

    cues = risk_coach_reasoning_cues(context)
    questions = risk_coach_questions(context)

    assert any("mồi giải thưởng" in cue for cue in cues)
    assert any("nguồn cảnh báo" in cue for cue in cues)
    assert questions[0].startswith("Bạn có đang được yêu cầu chuyển phí")
    assert all("đổi tiền" not in cue for cue in cues)


def test_risk_coach_reads_a_short_reply_as_an_answer_to_the_selected_question(monkeypatch) -> None:
    captured: dict[str, object] = {}
    selected_question = "Bạn có đang được yêu cầu chuyển phí hoặc đặt cọc để nhận thưởng/vé không?"

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content="Vậy bạn nên dừng giao dịch và xác minh qua kênh chính thức."
                        )
                    )
                ]
            )

    class FakeOpenAI:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(timi_assistant, "OpenAI", FakeOpenAI)
    monkeypatch.setattr(
        timi_assistant,
        "get_settings",
        lambda: SimpleNamespace(
            groq_api_key="test-key",
            groq_model_name="test-model",
            groq_base_url="https://example.test/openai/v1",
            assistant_chat_max_completion_tokens=640,
        ),
    )
    context = AssistantRiskContext(
        transaction_id="00000000-0000-0000-0000-000000000001",
        note="Thanh toán để nhận thưởng vé máy bay",
        risk_level="high",
        risk_score=1,
        signals=["Tài khoản ***3445 đã được đánh dấu cần thận trọng."],
    )

    answer, out_of_scope = answer_timi_question(
        "Tôi có",
        [SimpleNamespace(role="assistant", content=selected_question)],
        risk_context=context,
        risk_guided_question=selected_question,
    )

    assert answer.startswith("Vậy bạn nên dừng")
    assert not out_of_scope
    system_text = "\n".join(message["content"] for message in captured["messages"] if message["role"] == "system")
    assert "Tin nhắn mới nhất của người dùng là câu trả lời" in system_text
    assert selected_question in system_text
