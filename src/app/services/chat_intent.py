"""Bounded intent selection for the Chat Support front door.

Every assistant message enters through Chat Support before another specialist
is invoked.  Clear, security-sensitive intents use the existing deterministic
rules first; only ambiguous wording is sent to the Chat Support provider.  A
provider can return one of five labels, never a URL or an executable action.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, ValidationError

from src.app.agents.contracts import ChatIntent
from src.app.agents.task_navigation import is_semantic_product_question, route_task
from src.app.config import get_settings
from src.app.services.agent_provider_config import chat_provider_config, is_rate_limit_error
from src.app.services.contextual_navigation_agent import is_contextual_navigation_candidate

if TYPE_CHECKING:
    from src.app.schemas.assistant import AssistantChatTurn, AssistantTaskState


logger = logging.getLogger(__name__)


class _ModelIntentDecision(BaseModel):
    """Untrusted provider output validated against the bounded intent set."""

    model_config = ConfigDict(extra="forbid")
    intent: Literal[
        "question",
        "transfer",
        "navigation",
        "guardian_preference",
        "out_of_scope",
    ]


@dataclass(frozen=True, slots=True)
class ChatIntentClassification:
    intent: ChatIntent
    task_state: AssistantTaskState
    source: Literal["rules", "model"]


_JSON_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_NAVIGATION_ACTION_PATTERN = re.compile(
    r"\b(?:mo|vao|den|sang|ve|qua|dua)\b|\b(?:trang|man hinh|muc|phan)\b"
)
_ACCOUNT_PATTERN = re.compile(r"(?<!\d)(?:\d[ .-]?){6,19}\d(?!\d)")

_SYSTEM_PROMPT = """
Bạn là bộ phân loại đầu vào của Chat Support trong ứng dụng Timi. Mọi tin nhắn
đều phải chọn đúng MỘT nhãn dưới đây rồi trả về JSON duy nhất:
{"intent":"question|transfer|navigation|guardian_preference|out_of_scope"}

Quy tắc:
- transfer: người dùng muốn chuyển/gửi tiền, tạo giao dịch, hoặc đang trả lời
  số tài khoản, ngân hàng, số tiền của một bản nháp chuyển tiền đang mở.
- navigation: người dùng yêu cầu mở/đến/về một màn hình trong Timi. Đây chỉ là
  ý định điều hướng, không phải URL và không được tự tạo route.
- guardian_preference: yêu cầu trực tiếp bật hoặc tắt tự động nghe/bảo vệ cuộc gọi.
- question: câu hỏi, yêu cầu hướng dẫn, so sánh hoặc giải thích về tính năng,
  cảnh báo, giao dịch, lịch sử, QR, Face ID, PIN, đăng nhập, chính sách và
  trợ giúp. Câu hỏi “có ... không?” luôn là question, không phải navigation.
- out_of_scope: chủ đề không liên quan đến Timi.

Nếu câu có nhiều ý, ưu tiên an toàn: câu hỏi về quyền admin, OTP/PIN/mật khẩu
hoặc dấu hiệu lừa đảo là question; không chọn transfer chỉ vì có chữ “chuyển”.
Không trả thêm trường, Markdown, lời giải thích hay hành động.
""".strip()


def _local_classification(
    message: str,
    task_state: AssistantTaskState,
) -> tuple[ChatIntent | None, AssistantTaskState]:
    """Resolve high-confidence cases without spending a provider request."""

    decision = route_task(message, task_state)
    next_state = decision.task_state
    if decision.action is not None:
        if decision.action.type == "set_guardian_voice_monitoring":
            return ChatIntent.GUARDIAN_PREFERENCE, next_state
        if decision.action.type == "navigate_transfer_review":
            return ChatIntent.TRANSFER, next_state
        if decision.action.type == "navigate_app":
            return ChatIntent.NAVIGATION, next_state

    # A draft can be progressed by a bare account, bank or amount; keep those
    # messages under the transfer specialist even when no action is ready yet.
    if next_state.task == "transfer":
        return ChatIntent.TRANSFER, next_state

    # route_task deliberately marks semantic questions as a Chat Support
    # concern. This check also protects against a page keyword winning by
    # accident (for example, “QR có quét được khuôn mặt không?”).
    if is_semantic_product_question(message) or not decision.allow_contextual_navigation:
        return ChatIntent.QUESTION, next_state
    from src.app.services.timi_assistant import is_casual_message

    if is_casual_message(message):
        return ChatIntent.QUESTION, next_state
    # Keep an unfamiliar but navigation-shaped sentence on the navigation
    # hand-off path (for example, “mình muốn qua phần gửi tiền”). The Task
    # Navigator will still require its own route allowlist before acting.
    if _NAVIGATION_ACTION_PATTERN.search(_normalize(message)) and is_contextual_navigation_candidate(message):
        return ChatIntent.NAVIGATION, next_state
    return None, next_state


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    return "".join(character for character in decomposed if not unicodedata.combining(character)).replace(
        "đ", "d"
    )


def _history_excerpt(history: list[AssistantChatTurn]) -> str:
    if not history:
        return "(không có lịch sử gần đây)"
    return "\n".join(
        f"{turn.role}: {_redact_for_classifier(turn.content.strip())[:280]}"
        for turn in history[-4:]
    )


def _redact_for_classifier(value: str) -> str:
    """Do not send a full account number to an intent-only model."""

    return _ACCOUNT_PATTERN.sub("[đã ẩn số tài khoản]", value)


def _model_classification(
    message: str,
    history: list[AssistantChatTurn],
) -> ChatIntent | None:
    settings = get_settings()
    provider = chat_provider_config(settings)
    if not provider.api_keys or not provider.base_url or not provider.model:
        return None

    request: dict[str, object] = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"LỊCH SỬ GẦN ĐÂY (chỉ để hiểu ngữ cảnh):\n{_history_excerpt(history)}\n\n"
                    f"TIN NHẮN MỚI:\n{_redact_for_classifier(message.strip())}"
                ),
            },
        ],
        "temperature": 0,
        "max_completion_tokens": min(settings.assistant_chat_max_completion_tokens, 96),
        "response_format": {"type": "json_object"},
    }
    if provider.model.strip().lower().startswith("openai/gpt-oss-"):
        request["reasoning_effort"] = "low"
        request["extra_body"] = {"reasoning_format": "hidden"}

    for index, api_key in enumerate(provider.api_keys):
        try:
            response = OpenAI(
                api_key=api_key,
                base_url=provider.base_url,
                max_retries=0,
                timeout=6.0,
            ).chat.completions.create(**request)
            raw = response.choices[0].message.content or ""
            payload = json.loads(_JSON_FENCE_PATTERN.sub("", raw.strip()))
            return ChatIntent(_ModelIntentDecision.model_validate(payload).intent)
        except (AttributeError, IndexError, TypeError, ValueError, ValidationError):
            logger.warning("Chat Support intent classifier returned invalid JSON")
            return None
        except Exception as exc:
            if is_rate_limit_error(exc) and index < len(provider.api_keys) - 1:
                logger.warning(
                    "Chat Support intent classifier is rate limited; trying a configured backup key"
                )
                continue
            logger.info("Chat Support intent classifier unavailable (%s)", type(exc).__name__)
            return None
    return None


def classify_chat_intent(
    message: str,
    task_state: AssistantTaskState,
    history: list[AssistantChatTurn],
) -> ChatIntentClassification:
    """Return a bounded hand-off label and any safe draft-state update."""

    local_intent, next_state = _local_classification(message, task_state)
    if local_intent is not None:
        return ChatIntentClassification(local_intent, next_state, "rules")

    model_intent = _model_classification(message, history)
    if model_intent is not None:
        return ChatIntentClassification(model_intent, next_state, "model")

    # Provider outage must never create a navigation or transfer action. A
    # known Timi phrase remains a safe question; unknown text is out of scope.
    # Keep the local fallback conservative: recognised product vocabulary is
    # safe to answer as a question, while unrelated text remains out of scope.
    from src.app.services.timi_assistant import is_in_scope

    fallback = ChatIntent.QUESTION if is_in_scope(message) else ChatIntent.OUT_OF_SCOPE
    return ChatIntentClassification(fallback, next_state, "rules")
