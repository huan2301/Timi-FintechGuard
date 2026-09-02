import json
from types import SimpleNamespace

from src.app.services import contextual_navigation_agent


def _response(payload: dict[str, object]) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))])


def test_navigation_agent_understands_natural_transfer_page_request(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return _response(
                {
                    "route": "/transfer",
                }
            )

    class FakeOpenAI:
        def __init__(self, *, api_key: str, base_url: str, **_kwargs) -> None:
            captured["api_key"] = api_key
            captured["base_url"] = base_url
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(
        contextual_navigation_agent,
        "get_settings",
        lambda: SimpleNamespace(
            task_navigator_agent_enabled=True,
            task_navigator_agent_api_key="navigator-key",
            task_navigator_agent_api_keys="",
            task_navigator_agent_base_url="https://navigator.test/v1",
            task_navigator_agent_model="router-model",
            task_navigator_agent_max_completion_tokens=120,
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
        ),
    )
    monkeypatch.setattr(contextual_navigation_agent, "OpenAI", FakeOpenAI)

    result = contextual_navigation_agent.understand_navigation_request("Mình muốn qua phần gửi tiền")

    assert result is not None
    assert result.route == "/transfer"
    assert captured["model"] == "router-model"
    assert captured["response_format"] == {"type": "json_object"}


def test_navigation_agent_rejects_model_route_outside_allowlist(monkeypatch) -> None:
    class FakeOpenAI:
        def __init__(self, **_kwargs) -> None:
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(create=lambda **_kwargs: _response({"route": "https://unsafe.example"}))
            )

    monkeypatch.setattr(
        contextual_navigation_agent,
        "get_settings",
        lambda: SimpleNamespace(
            task_navigator_agent_enabled=True,
            task_navigator_agent_api_key="navigator-key",
            task_navigator_agent_api_keys="",
            task_navigator_agent_base_url="https://navigator.test/v1",
            task_navigator_agent_model="router-model",
            task_navigator_agent_max_completion_tokens=120,
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
        ),
    )
    monkeypatch.setattr(contextual_navigation_agent, "OpenAI", FakeOpenAI)

    assert contextual_navigation_agent.understand_navigation_request("Mở phần bất kỳ") is None


def test_navigation_agent_accepts_public_help_route_from_allowlist(monkeypatch) -> None:
    class FakeOpenAI:
        def __init__(self, **_kwargs) -> None:
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(create=lambda **_kwargs: _response({"route": "/help"}))
            )

    monkeypatch.setattr(
        contextual_navigation_agent,
        "get_settings",
        lambda: SimpleNamespace(
            task_navigator_agent_enabled=True,
            task_navigator_agent_api_key="navigator-key",
            task_navigator_agent_api_keys="",
            task_navigator_agent_base_url="https://navigator.test/v1",
            task_navigator_agent_model="router-model",
            task_navigator_agent_max_completion_tokens=120,
            groq_api_key="",
            groq_base_url="",
            groq_model_name="",
        ),
    )
    monkeypatch.setattr(contextual_navigation_agent, "OpenAI", FakeOpenAI)

    result = contextual_navigation_agent.understand_navigation_request("Mình muốn tìm nơi được hỗ trợ")

    assert result is not None
    assert result.route == "/help"
