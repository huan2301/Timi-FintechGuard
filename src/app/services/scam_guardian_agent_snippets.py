"""
REFERENCE SNIPPETS for Phase 1 – paste into scam_guardian_agent.py

These are not imported at runtime; they document the exact functions to merge.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1) Smarter context
# ---------------------------------------------------------------------------

HIGH_SIGNAL_MARKERS = (
    "otp",
    "anydesk",
    "teamviewer",
    "công an",
    "cong an",
    "tài khoản an toàn",
    "tai khoan an toan",
    "chuyển tiền",
    "chuyen tien",
    "khóa tài khoản",
    "khoa tai khoan",
    "phong tỏa",
    "phong toa",
    "không được nói",
    "khong duoc noi",
    "mã pin",
    "mat khau",
    "mật khẩu",
    "đọc mã",
    "doc ma",
)


def conversation_payload_v1(state: Any, latest_text: str) -> dict[str, Any]:
    segments_raw = list(state.segments)
    tail = segments_raw[-10:]
    head = segments_raw[:-10]
    important: list[tuple[str, str]] = []
    for speaker, text in head:
        low = text.lower()
        if any(m in low for m in HIGH_SIGNAL_MARKERS):
            important.append((speaker, text))
    important = important[-6:]
    ordered = important + tail
    segments: list[dict[str, str]] = []
    prev = None
    for speaker, text in ordered:
        item = {"speaker": speaker, "text": text[:500]}
        key = (speaker, item["text"])
        if key != prev:
            segments.append(item)
            prev = key
    return {
        "latest_transcript": latest_text[:1500],
        "conversation": segments[-16:],
        "task": "Return the next agent-owned risk decision as strict JSON only.",
    }


# ---------------------------------------------------------------------------
# 2) decision_confidence in normalize (add near end of _normalize_decision_payload)
# ---------------------------------------------------------------------------


def attach_confidence(payload: dict[str, Any], first_fn: Any) -> dict[str, Any]:
    raw_conf = first_fn("decision_confidence", "confidence", "decisionConfidence")
    try:
        conf = float(raw_conf) if raw_conf is not None else 0.7
    except (TypeError, ValueError):
        conf = 0.7
    payload["decision_confidence"] = max(0.0, min(1.0, conf))
    return payload


# ---------------------------------------------------------------------------
# 3) Retry wrapper skeleton
# ---------------------------------------------------------------------------


def call_agent_with_json_retry(
    *,
    client_factory: Any,
    model: str,
    system_prompt: str,
    user_content: str,
    max_completion_tokens: int = 900,
    parse_fn: Any,
    to_result_fn: Any,
    max_attempts: int = 2,
) -> tuple[Any, float]:
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            response = client_factory().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                temperature=0,
                max_completion_tokens=max_completion_tokens,
                response_format={"type": "json_object"},
            )
            decision = parse_fn(response)
            conf = float(getattr(decision, "decision_confidence", 0.7) or 0.7)
            return to_result_fn(decision), conf
        except Exception as exc:
            last_exc = exc
            msg = str(exc).lower()
            retriable = any(
                k in msg
                for k in (
                    "json",
                    "schema",
                    "validate",
                    "rỗng",
                    "empty",
                    "failed_generation",
                    "max completion",
                )
            )
            if attempt + 1 < max_attempts and retriable:
                logger.warning("Guardian JSON/schema fail attempt %s, retrying", attempt + 1)
                continue
            raise
    raise last_exc  # type: ignore[misc]
