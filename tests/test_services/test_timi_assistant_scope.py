from types import SimpleNamespace

import src.app.services.timi_assistant as timi_assistant
from src.app.services.timi_assistant import (
    ADMIN_POLICY_ANSWER,
    ADMIN_TRANSFER_ANSWER,
    HISTORY_GUIDANCE_ANSWER,
    OUT_OF_SCOPE_ANSWER,
    SENSITIVE_CREDENTIAL_ANSWER,
    answer_timi_question,
    contains_sensitive_credential,
    is_in_scope,
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
