"""Groq-backed understanding for ambiguous, low-risk page navigation.

The model may recognise a natural-language intent, but it cannot choose an
arbitrary URL or execute an action. Its JSON route is parsed against a small
allowlist and TaskNavigationAgent maps that value to a server-owned UI action.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from typing import Literal, TypeAlias

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, ValidationError

from src.app.config import get_settings
from src.app.services.agent_provider_config import (
    is_rate_limit_error,
    task_navigator_provider_config,
)

logger = logging.getLogger(__name__)

NavigationRoute: TypeAlias = Literal[
    "/dashboard",
    "/transfer",
    "/qr?mode=scan",
    "/qr?mode=create",
    "/history",
    "/me",
    "/me?open=password",
    "/me?open=pin",
    "/setup-pin",
    "/setup-face",
    "/terms",
    "/privacy",
    "/mission",
    "/help",
    "/services",
    "/download",
    "/demo",
    "/cookies",
]


class ContextualNavigationDecision(BaseModel):
    """Untrusted model output; only one allowlisted route field is accepted."""

    model_config = ConfigDict(extra="forbid")
    route: NavigationRoute | None = None


_NAVIGATION_CUE_PATTERN = re.compile(
    r"\b(?:mo|vao|den|sang|ve|qua|dua|trang|man hinh|muc|phan|chuc nang|"
    r"dieu khoan|bao mat|su menh|tro giup|ho tro|cau hoi thuong gap|"
    r"dich vu|tai app|tai ung dung|demo|cookie)\b"
)
_JSON_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

_SYSTEM_PROMPT = """
Bạn là Contextual Navigation Agent của ứng dụng Timi. Hãy nhận diện DUY NHẤT
yêu cầu điều hướng màn hình trực tiếp từ câu người dùng. Không thực hiện giao
dịch, không thu thập thông tin chuyển tiền và không giải thích cách dùng.

Trả về DUY NHẤT một JSON object đúng một trường, không Markdown, không giải thích:
{"route":"<một route hoặc null>"}

Chỉ được chọn một route trong danh sách:
- /transfer: người dùng muốn mở, đến, sang trang Chuyển tiền.
- /dashboard: người dùng muốn về Trang chủ hoặc Tổng quan.
- /qr?mode=scan: mở quét QR.
- /qr?mode=create: tạo QR nhận tiền.
- /history: mở Lịch sử giao dịch.
- /me: mở Hồ sơ/tài khoản.
- /me?open=password: mở đổi mật khẩu.
- /me?open=pin: mở đổi PIN.
- /setup-pin: mở tạo PIN.
- /setup-face: mở Face ID.
- /terms: mở Điều khoản sử dụng.
- /privacy: mở Chính sách bảo mật dữ liệu.
- /mission: mở Sứ mệnh của Timi.
- /help: mở Trung tâm trợ giúp/câu hỏi thường gặp.
- /services: mở trang Dịch vụ cùng các tính năng Timi.
- /download: mở trang tải ứng dụng Timi.
- /demo: mở trang xem demo Timi Guard.
- /cookies: mở Chính sách cookie.

Nếu không phải yêu cầu điều hướng rõ ràng, hoặc chỉ hỏi hướng dẫn/cách làm,
route phải là null. Đặc biệt, "trang chuyển tiền" là /transfer; tuyệt đối
không nhầm với "trang chủ" là /dashboard. Không được trả bất kỳ key nào khác.
""".strip()


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    without_accents = "".join(character for character in decomposed if not unicodedata.combining(character))
    return without_accents.replace("đ", "d")


def is_contextual_navigation_candidate(message: str) -> bool:
    """Avoid an LLM call for ordinary product-support or transfer chat."""

    return bool(_NAVIGATION_CUE_PATTERN.search(_normalize(message)))


def understand_navigation_request(message: str) -> ContextualNavigationDecision | None:
    """Return an allowlisted route for an ambiguous navigation request.

    Provider failures deliberately return ``None``. The caller then follows the
    normal product-chat path instead of treating an unavailable LLM as a UI
    command or a failed financial action.
    """

    if not is_contextual_navigation_candidate(message):
        return None

    settings = get_settings()
    provider = task_navigator_provider_config(settings)
    if not settings.task_navigator_agent_enabled or not provider.api_key or not provider.base_url or not provider.model:
        return None

    request: dict[str, object] = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": message.strip()},
        ],
        "temperature": 0,
        "max_completion_tokens": settings.task_navigator_agent_max_completion_tokens,
        "response_format": {"type": "json_object"},
    }
    if provider.model.strip().lower().startswith("openai/gpt-oss-"):
        request["reasoning_effort"] = "low"
        request["extra_body"] = {"reasoning_format": "hidden"}

    response = _request_with_key_failover(provider.api_keys, provider.base_url, request)
    if response is None:
        return None

    try:
        raw = response.choices[0].message.content or ""
        payload = json.loads(_JSON_FENCE_PATTERN.sub("", raw.strip()))
        return ContextualNavigationDecision.model_validate(payload)
    except (AttributeError, IndexError, TypeError, ValueError, ValidationError):
        logger.warning("Contextual Navigation Agent returned an invalid decision")
        return None


def _request_with_key_failover(
    api_keys: tuple[str, ...],
    base_url: str,
    request: dict[str, object],
) -> object | None:
    for index, api_key in enumerate(api_keys):
        try:
            return OpenAI(
                api_key=api_key,
                base_url=base_url,
                max_retries=0,
                timeout=8.0,
            ).chat.completions.create(**request)
        except Exception as exc:
            if is_rate_limit_error(exc) and index < len(api_keys) - 1:
                logger.warning("Contextual Navigation Agent is rate limited; trying a configured backup key")
                continue
            logger.info(
                "Contextual Navigation Agent unavailable (%s)",
                type(exc).__name__,
            )
            return None
    return None
