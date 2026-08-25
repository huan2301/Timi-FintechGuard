from types import SimpleNamespace

from src.app.services.agent_provider_config import (
    chat_provider_config,
    guardian_provider_config,
    guardian_stt_provider_config,
    task_navigator_provider_config,
)


def test_specialists_prefer_their_own_provider_credentials() -> None:
    settings = SimpleNamespace(
        groq_api_key="legacy-key",
        groq_base_url="https://legacy.test/v1",
        groq_model_name="legacy-chat",
        chat_agent_api_key="chat-key",
        chat_agent_api_keys="chat-backup-1, chat-backup-2, chat-key",
        chat_agent_base_url="https://chat.test/v1",
        chat_agent_model="small-chat",
        task_navigator_agent_api_key="navigator-key",
        task_navigator_agent_api_keys="navigator-backup",
        task_navigator_agent_base_url="https://navigator.test/v1",
        task_navigator_agent_model="fast-router",
        guardian_agent_api_key="guardian-key",
        guardian_agent_api_keys="guardian-backup",
        guardian_agent_base_url="https://guardian.test/v1",
        guardian_agent_model="guardian-model",
        guardian_stt_api_key="stt-key",
        guardian_stt_api_keys="stt-backup",
        guardian_stt_base_url="https://stt.test/v1",
        guardian_stt_model="whisper-model",
    )

    assert chat_provider_config(settings).api_key == "chat-key"
    assert chat_provider_config(settings).api_keys == ("chat-key", "chat-backup-1", "chat-backup-2")
    assert chat_provider_config(settings).model == "small-chat"
    assert task_navigator_provider_config(settings).api_keys == (
        "navigator-key",
        "navigator-backup",
    )
    assert task_navigator_provider_config(settings).model == "fast-router"
    assert guardian_provider_config(settings).api_key == "guardian-key"
    assert guardian_provider_config(settings).api_keys == ("guardian-key", "guardian-backup")
    assert guardian_stt_provider_config(settings).api_key == "stt-key"
    assert guardian_stt_provider_config(settings).api_keys == ("stt-key", "stt-backup")


def test_specialists_remain_compatible_with_legacy_groq_config() -> None:
    settings = SimpleNamespace(
        groq_api_key="legacy-key",
        groq_base_url="https://legacy.test/v1",
        groq_model_name="legacy-chat",
        guardian_agent_model="guardian-model",
        guardian_stt_model="whisper-model",
    )

    assert chat_provider_config(settings).api_key == "legacy-key"
    assert guardian_provider_config(settings).base_url == "https://legacy.test/v1"
    assert guardian_stt_provider_config(settings).api_key == "legacy-key"
    assert task_navigator_provider_config(settings).api_key == "legacy-key"
