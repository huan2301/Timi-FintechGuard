"""Resolve isolated provider credentials for each specialist agent."""

from __future__ import annotations

from dataclasses import dataclass

from src.app.config import Settings, get_settings


@dataclass(frozen=True, slots=True)
class AgentProviderConfig:
    """Credentials for one specialist, including its ordered key failover pool."""

    api_keys: tuple[str, ...]
    base_url: str
    model: str

    @property
    def api_key(self) -> str:
        """Keep single-key callers compatible while exposing ``api_keys``."""

        return self.api_keys[0] if self.api_keys else ""


def _value(settings: object, name: str) -> str:
    value = getattr(settings, name, "")
    return value.strip() if isinstance(value, str) else ""


def _key_pool(*values: str) -> tuple[str, ...]:
    """Read a primary key plus comma-separated backups without duplicates."""

    keys: list[str] = []
    for value in values:
        for candidate in value.split(","):
            key = candidate.strip()
            if key and key not in keys:
                keys.append(key)
    return tuple(keys)


def is_rate_limit_error(exc: BaseException) -> bool:
    """Identify a provider quota error without relying on provider-specific types."""

    status_code = getattr(exc, "status_code", None)
    message = str(exc).lower()
    return status_code == 429 or "rate limit" in message or "rate_limit" in message


def chat_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_keys=_key_pool(
            _value(current, "chat_agent_api_key") or _value(current, "groq_api_key"),
            _value(current, "chat_agent_api_keys"),
        ),
        base_url=_value(current, "chat_agent_base_url") or _value(current, "groq_base_url"),
        model=_value(current, "chat_agent_model") or _value(current, "groq_model_name"),
    )


def task_navigator_provider_config(
    settings: Settings | object | None = None,
) -> AgentProviderConfig:
    """Resolve the optional Groq model used for ambiguous UI navigation."""

    current = settings or get_settings()
    return AgentProviderConfig(
        api_keys=_key_pool(
            _value(current, "task_navigator_agent_api_key") or _value(current, "groq_api_key"),
            _value(current, "task_navigator_agent_api_keys"),
        ),
        base_url=(_value(current, "task_navigator_agent_base_url") or _value(current, "groq_base_url")),
        model=(_value(current, "task_navigator_agent_model") or _value(current, "groq_model_name")),
    )


def guardian_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_keys=_key_pool(
            _value(current, "guardian_agent_api_key") or _value(current, "groq_api_key"),
            _value(current, "guardian_agent_api_keys"),
        ),
        base_url=_value(current, "guardian_agent_base_url") or _value(current, "groq_base_url"),
        model=_value(current, "guardian_agent_model"),
    )


def guardian_stt_provider_config(settings: Settings | object | None = None) -> AgentProviderConfig:
    current = settings or get_settings()
    return AgentProviderConfig(
        api_keys=_key_pool(
            (
                _value(current, "guardian_stt_api_key")
                or _value(current, "guardian_agent_api_key")
                or _value(current, "groq_api_key")
            ),
            _value(current, "guardian_stt_api_keys"),
        ),
        base_url=(
            _value(current, "guardian_stt_base_url")
            or _value(current, "guardian_agent_base_url")
            or _value(current, "groq_base_url")
        ),
        model=_value(current, "guardian_stt_model"),
    )
