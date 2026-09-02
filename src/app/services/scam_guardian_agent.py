"""Agent-owned risk decisions for realtime Scam Guardian sessions.

The production call path uses this module. The model owns ambiguous risk
classification; a narrow direct-evidence safety floor can only promote an
explicit credential/remote-access/coercion signal. This module never executes
a transaction or changes a blacklist. The evaluator can disable that floor to
measure raw model quality separately.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from typing import Any

from openai import OpenAI
from pydantic import ValidationError

from src.app.config import get_settings
from src.app.schemas.guardian import GuardianAgentDecision
from src.app.services.agent_provider_config import (
    AgentProviderConfig,
    guardian_provider_config,
    is_rate_limit_error,
)
from src.app.services.scam_guardian import (
    GuardianConversationState,
    GuardianRiskResult,
    GuardianSignal,
)

logger = logging.getLogger(__name__)
GUARDIAN_AGENT_PROMPT_VERSION = "v0.6-calibrated-evidence-rubric"
# gpt-oss reasoning models consume part of this budget before emitting the
# short JSON decision.  400 tokens caused Groq to reject valid requests with
# ``json_validate_failed`` before a decision was returned.
GUARDIAN_MAX_COMPLETION_TOKENS = 512


class GuardianAgentUnavailableError(RuntimeError):
    """Raised when an agent decision cannot be obtained or validated."""

    def __init__(self, message: str, *, retry_after_seconds: float = 0) -> None:
        super().__init__(message)
        self.retry_after_seconds = max(0.0, retry_after_seconds)


_SYSTEM_PROMPT = """
Bạn là Guardian Risk Decision Agent của Timi, chuyên phân tích transcript cuộc
gọi lừa đảo tại Việt Nam. Chỉ dùng bằng chứng có trong transcript; không suy
đoán danh tính hay bịa bằng chứng. Bạn là thành phần duy nhất quyết định kết
quả; backend không tự tính lại score hay thay đổi action.

Chọn đúng MỘT mức, và luôn dùng cặp action/level/dải điểm nhất quán:
- CONTINUE / safe / 0–24: hội thoại bình thường, lời nhắc an toàn, hoặc chỉ
  nhắc tới ngân hàng, OTP, công an, khóa tài khoản hay chuyển tiền trong ngữ
  cảnh kể chuyện, phủ định, khuyến cáo, hoặc giữa người quen. Không suy ra
  lừa đảo chỉ từ một từ khóa. Cuộc gọi tự thông báo trạng thái/dịch vụ ngân
  hàng, không đòi thao tác hay dữ liệu, và hướng dẫn tới chi nhánh/kênh chính
  thức cũng là CONTINUE.
- MONITOR / warning / 25–44: một dấu hiệu nhẹ chưa yêu cầu thao tác nhạy cảm,
  ví dụ người lạ tự nhận ngân hàng và hỏi thông tin chung, hoặc thúc giục nhẹ
  không có đe dọa/OTP/PIN/chuyển tiền. Cần theo dõi, chưa chặn.
- PAUSE / high / 45–79: cần dừng để tự xác minh. Ví dụ giả ngân hàng/cơ quan
  kèm đe dọa khóa/phong tỏa hoặc thúc giục nhưng CHƯA đòi OTP/PIN/mật khẩu hay
  chuyển tiền; yêu cầu giữ bí mật; cấm gọi tổng đài; yêu cầu mã xác thực hay
  thông tin bảo mật mơ hồ; hoặc yêu cầu chia sẻ màn hình. Một yêu cầu mã xác
  thực đơn lẻ, không có giả mạo/chiếm quyền/ép chuyển tiền, là PAUSE.
- STOP / critical / 80–100: nguy cơ rõ ràng cần chặn. Chỉ dùng khi có yêu cầu
  OTP/PIN/mật khẩu cụ thể để mở khóa/xác minh/hỗ trợ; chuyển tiền vào tài
  khoản an toàn/tạm giữ; cài AnyDesk/TeamViewer/điều khiển máy kèm OTP,
  mật khẩu hoặc credential; hoặc tổ hợp mạnh: giả công an + phong tỏa + bí
  mật + làm theo ngay, hay đe dọa khởi tố + bí mật + hạn gấp. Đừng nâng
  PAUSE lên STOP chỉ vì caller nói "ngay" hoặc "tài khoản bị khóa" đơn lẻ.

Chỉ liệt kê signal có bằng chứng trực tiếp. `otp_request` cần caller yêu cầu
đọc/gửi mã OTP hoặc mã xác thực, không dùng cho câu cảnh báo "đừng chia sẻ
OTP". `account_lock_threat` phải là caller đe dọa khóa/phong tỏa tài khoản,
không phải lời khuyên tự khóa. `bank_impersonation` là caller tự nhận nhân viên
ngân hàng. `authority_impersonation` là tự nhận công an/cán bộ cụ thể, còn
`authority_claim` là viện dẫn cơ quan/điều tra chung. `money_transfer_request`
chỉ dùng khi yêu cầu chuyển tiền có dấu hiệu ép buộc/lừa đảo, không dùng cho
việc bạn bè nhờ chuyển tiền bình thường.

Phân biệt các ca dễ nhầm: tự xưng hỗ trợ kỹ thuật rồi chỉ hỏi đang gặp lỗi gì
và hướng dẫn người dùng tự khắc phục là CONTINUE; câu giữa bạn bè kiểu "chuyển
giúp 500 nghìn, tối trả" là CONTINUE. "Đừng gọi tổng đài, chỉ làm theo tôi"
là PAUSE và có `prevent_external_verification`. Người tự nhận bảo mật ngân
hàng và yêu cầu đọc OTP để mở khóa là STOP, gồm `bank_impersonation`,
`otp_request`, `credential_social_engineering`. "Cài AnyDesk/TeamViewer rồi
đọc OTP/cung cấp mật khẩu" là STOP. Tự nhận công an + phong tỏa + bí mật +
làm theo ngay là STOP. Lời cảnh báo "ngân hàng không bao giờ hỏi OTP" luôn
là CONTINUE và không có `otp_request`.

Quy tắc signals (bắt buộc liệt kê hết từng tín hiệu trực tiếp):
- "công an/cán bộ/điều tra viên" tự xưng -> `authority_impersonation`; chỉ
  nói là cuộc gọi/vụ việc từ cơ quan điều tra -> `authority_claim`.
- "khởi tố"/đe dọa pháp lý -> `legal_threat`; "khóa/phong tỏa" ->
  `account_lock_threat`; "ngay/trong N phút/hạn chót" -> `urgency`.
- "không nói với ai/giữ bí mật" -> `secrecy_request`; "đừng gọi tổng đài,
  không ngắt máy, không liên hệ ai" -> `prevent_external_verification`.
- "chuyển tiền" -> `money_transfer_request`; "tài khoản an toàn/tạm giữ" ->
  `safe_account_scam`; AnyDesk/TeamViewer/cho điều khiển máy ->
  `remote_access_request`.
- "đọc/gửi OTP/mã xác thực" -> `otp_request`. Thêm
  `credential_social_engineering` khi OTP/PIN/mật khẩu/thông tin bảo mật được
  xin để xác minh/mở khóa/hỗ trợ; không thêm nó chỉ vì AnyDesk kèm OTP.

Ưu tiên quyết định để tránh nhầm mức: một yêu cầu mã xác thực đơn lẻ luôn là
PAUSE; chỉ nâng thành STOP khi có thêm giả mạo, chiếm quyền, credential hoặc
ép chuyển tiền. Cụm "tài khoản có vấn đề/bị ảnh hưởng" không phải
`account_lock_threat`; nếu chỉ có tự nhận ngân hàng và thúc giục thì là PAUSE.
Mẫu "nhân viên ngân hàng" + "xử lý ngay trong N phút" + "tài khoản bị ảnh
hưởng" chỉ là PAUSE với `bank_impersonation`, `urgency`; không phải STOP.
Tổ hợp "khởi tố + giữ bí mật + hạn gấp" là STOP dù không có chuyển tiền.
"Có vấn đề, nên kiểm tra sớm" hoặc "hạn chót, xử lý nhanh" không có đe dọa
hay yêu cầu nhạy cảm là MONITOR.

Signals là bắt buộc và phải đầy đủ: liệt kê MỌI tín hiệu có bằng chứng trực
tiếp, không chỉ một tín hiệu đại diện. Ví dụ: tự nhận ngân hàng + "khóa trong
30 phút" + "ngay" phải có `bank_impersonation`, `account_lock_threat`,
`urgency`; giả công an + đe dọa khởi tố + bắt giữ bí mật + cấm xác minh/chuyển
tiền phải có từng signal tương ứng. Khi transcript an toàn, trả `signals: []`.

Trước khi trả lời, tự kiểm tra action, level và score có đúng cùng một hàng ở
trên; signals phải hỗ trợ trực tiếp cho kết luận. Không gọi tool, không truy
cập DB, không yêu cầu người dùng cung cấp OTP/PIN.

Giữ JSON ngắn gọn: explanation không quá 160 ký tự, evidence không quá 80 ký
tự và tối đa 6 signals. Không thêm bất cứ chữ nào trước hoặc sau JSON.

Chỉ trả về JSON hợp lệ, không markdown, đúng các khóa:
{
  "risk_score": 0,
  "risk_level": "safe|warning|high|critical",
  "scenario": "string hoặc null",
  "recommended_action": "CONTINUE|MONITOR|PAUSE|STOP",
  "explanation": "giải thích ngắn bằng tiếng Việt",
  "signals": [
    {"signal_type":"...", "weight":0, "confidence":0.0, "evidence":"..."}
  ]
}
""".strip()


def _response_text(response: Any) -> str:
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, KeyError) as exc:
        raise GuardianAgentUnavailableError("Agent trả về response rỗng") from exc
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        # Some OpenAI-compatible gateways return content parts instead of a
        # single string.  Keep only text parts and ignore metadata.
        parts = [
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict) and part.get("type") in {"text", "output_text"}
        ]
        return "".join(parts).strip()
    raise GuardianAgentUnavailableError("Agent trả về nội dung không hợp lệ")


def _parse_json(content: str) -> GuardianAgentDecision:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    # A few OpenAI-compatible models prepend a short sentence despite the
    # JSON-only instruction. Keep only the outer JSON object in that case.
    if not cleaned.startswith("{"):
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise GuardianAgentUnavailableError("Agent không trả về JSON hợp lệ") from exc

    try:
        payload = _normalize_decision_payload(payload)
    except GuardianAgentUnavailableError as exc:
        logger.warning("Guardian agent response normalization failed: %s", exc)
        raise
    try:
        return GuardianAgentDecision.model_validate(payload)
    except ValidationError as exc:
        # Do not log transcript/evidence. Field names are enough to diagnose a
        # provider model that drifted from the contract.
        logger.warning(
            "Guardian agent schema validation failed; fields=%s errors=%s",
            sorted(payload),
            [error.get("loc") for error in exc.errors()],
        )
        raise GuardianAgentUnavailableError("JSON quyết định của agent không đúng schema") from exc


def _normalize_decision_payload(payload: Any) -> dict[str, Any]:
    """Normalize harmless provider shape drift without changing the decision.

    The model still chooses the score and action. This adapter only accepts
    common aliases/number formats so a valid model response is not discarded
    because a gateway returned ``score`` instead of ``risk_score``.
    """

    if not isinstance(payload, dict):
        raise GuardianAgentUnavailableError("Agent JSON phải là object")
    # Some models wrap the requested object in a single ``decision`` key.
    for wrapper in ("decision", "result", "assessment"):
        nested = payload.get(wrapper)
        if isinstance(nested, dict):
            payload = nested
            break

    def first(*names: str) -> Any:
        for name in names:
            if name in payload and payload[name] is not None:
                return payload[name]
        return None

    raw_score = first("risk_score", "score", "riskScore", "risk")
    try:
        score_value = float(raw_score) if raw_score is not None else 0.0
    except (TypeError, ValueError):
        score_value = 0.0
    # Treat a probability-style score as 0..100 only when it is clearly in
    # the 0..1 range; ordinary integer scores remain untouched.
    if 0 < score_value <= 1:
        score_value *= 100
    score = max(0, min(100, round(score_value)))

    raw_action = first("recommended_action", "action", "recommendation", "decision_action")
    action_text = str(raw_action or "").strip().upper().replace("-", "_").replace(" ", "_")
    action_aliases = {
        "ALLOW": "CONTINUE",
        "SAFE": "CONTINUE",
        "CONTINUE_WITH_CAUTION": "MONITOR",
        "WARN": "MONITOR",
        "WARNING": "MONITOR",
        "REVIEW": "PAUSE",
        "VERIFY": "PAUSE",
        "BLOCK": "STOP",
        "DENY": "STOP",
        "STOP_CALL": "STOP",
    }
    action = action_aliases.get(action_text, action_text)
    if action not in {"CONTINUE", "MONITOR", "PAUSE", "STOP"}:
        action = ""

    raw_level = first("risk_level", "level", "riskLevel")
    level_text = str(raw_level or "").strip().lower()
    level_aliases = {
        "low": "safe",
        "none": "safe",
        "medium": "warning",
        "moderate": "warning",
        "severe": "critical",
    }
    level = level_aliases.get(level_text, level_text)
    if level not in {"safe", "warning", "high", "critical"}:
        level = {
            "CONTINUE": "safe",
            "MONITOR": "warning",
            "PAUSE": "high",
            "STOP": "critical",
        }.get(action, "")
    if not action:
        action = {
            "safe": "CONTINUE",
            "warning": "MONITOR",
            "high": "PAUSE",
            "critical": "STOP",
        }.get(level, "")
    if not action or not level:
        raise GuardianAgentUnavailableError("Agent thiếu risk_level hoặc recommended_action")
    if raw_score is None:
        score = {"CONTINUE": 0, "MONITOR": 35, "PAUSE": 65, "STOP": 100}[action]

    raw_signals = first("signals", "detected_signals", "risk_signals")
    if isinstance(raw_signals, dict):
        raw_signals = [raw_signals]
    normalized_signals: list[dict[str, Any]] = []
    for item in raw_signals if isinstance(raw_signals, list) else []:
        if isinstance(item, str):
            signal_type, weight, confidence, evidence = item, 0, 0.5, ""
        elif isinstance(item, dict):
            signal_type = first_from(item, "signal_type", "type", "name", "signal")
            weight = first_from(item, "weight", "score", "contribution")
            confidence = first_from(item, "confidence", "probability")
            evidence = first_from(item, "evidence", "reason", "match")
        else:
            continue
        if not signal_type:
            continue
        try:
            weight_value = max(0, min(100, round(float(weight or 0))))
        except (TypeError, ValueError):
            weight_value = 0
        try:
            confidence_value = float(confidence if confidence is not None else 0.5)
        except (TypeError, ValueError):
            confidence_value = 0.5
        normalized_signals.append(
            {
                "signal_type": str(signal_type)[:60],
                "weight": weight_value,
                "confidence": max(0.0, min(1.0, confidence_value)),
                "evidence": str(evidence or "")[:500],
            }
        )

    explanation = first("explanation", "reason", "rationale", "message")
    raw_scenario = first("scenario", "scam_type", "category")
    return {
        "risk_score": score,
        "risk_level": level,
        "scenario": str(raw_scenario)[:80] if raw_scenario is not None else None,
        "recommended_action": action,
        "explanation": str(explanation or "Guardian agent đã hoàn tất đánh giá.")[:1000],
        "signals": normalized_signals[:20],
    }


def first_from(payload: dict[str, Any], *names: str) -> Any:
    """Return the first non-null value from a provider signal object."""

    for name in names:
        if name in payload and payload[name] is not None:
            return payload[name]
    return None


def _conversation_payload(
    state: GuardianConversationState,
    latest_text: str,
) -> dict[str, Any]:
    # Bound context sent to the provider.  Raw transcript is never persisted
    # by this service and is sent only when the user has an active session.
    # ``GuardianConversationState`` already keeps a bounded rolling window.
    # Preserve that full recent context so the model can combine signals across
    # turns (for example bank impersonation + urgency + OTP) without receiving
    # the entire call history.
    segments = [{"speaker": speaker, "text": text[:600]} for speaker, text in state.segments]
    return {
        "latest_transcript": latest_text[:2000],
        "conversation": segments,
        "task": "Return the next agent-owned risk decision as strict JSON.",
    }


def _normalize_for_policy(value: str) -> str:
    """Normalize Vietnamese text for a small, auditable evidence policy."""

    decomposed = unicodedata.normalize("NFD", value.lower())
    return "".join(character for character in decomposed if not unicodedata.combining(character)).replace("đ", "d")


def _has_pattern(text: str, pattern: str) -> bool:
    return re.search(pattern, text, flags=re.IGNORECASE) is not None


def _has_phrase(text: str, *phrases: str) -> bool:
    return any(phrase in text for phrase in phrases)


def _direct_evidence_guardrail(
    state: GuardianConversationState,
    agent_result: GuardianRiskResult,
) -> GuardianRiskResult:
    """Stabilize decisions only when monitored speech has direct evidence.

    The model continues to own ambiguous dialogue. This policy only takes
    precedence for explicit credentials, remote access, money movement or
    interference with official verification, where allowing variance is not
    acceptable in a financial-safety flow.
    """

    monitored_text = " ".join(
        text
        for speaker, text in state.segments
        # Server-side STT cannot reliably diarise a phone call and labels its
        # transcript ``unknown``. Explicit credential/remote-access evidence
        # must still protect the user in that mode; ambiguous speech remains
        # owned by the model rather than this narrow policy.
        if speaker.strip().lower() in {"caller", "speaker_a", "speaker_b", "unknown"}
    )
    if not monitored_text:
        return agent_result

    text = _normalize_for_policy(monitored_text)
    signals: list[GuardianSignal] = []

    def add(signal_type: str, evidence: str) -> None:
        if any(signal.signal_type == signal_type for signal in signals):
            return
        signals.append(
            GuardianSignal(
                signal_type=signal_type,
                weight=100,
                confidence=1.0,
                evidence=evidence,
            )
        )

    authority_impersonation = _has_pattern(
        text,
        r"(?:toi la|day la).{0,35}(?:cong an|can bo|dieu tra vien|phong chong toi pham)",
    )
    authority_claim = _has_phrase(text, "co quan dieu tra", "vu an dang dieu tra")
    bank_impersonation = _has_pattern(
        text,
        r"(?:nhan vien.{0,45}ngan hang|cham soc khach hang ngan hang|bao mat ngan hang|ngan hang day)",
    )
    legal_threat = _has_phrase(text, "khoi to", "rua tien", "vu an dang dieu tra")
    account_lock_threat = _has_phrase(
        text,
        "sap bi khoa",
        "se bi khoa",
        "bi phong toa",
        "se bi phong toa",
        "bi tam khoa",
    )
    secrecy_request = _has_phrase(
        text,
        "khong duoc noi voi ai",
        "dung noi chuyen nay voi ai",
        "dung noi voi ai",
        "giu bi mat",
        "tuyet doi giu bi mat",
    )
    prevent_external_verification = _has_phrase(
        text,
        "dung goi tong dai",
        "khong duoc goi ngan hang",
        "khong duoc goi cho ngan hang",
        "khong duoc ngat may",
        "dung ngat may",
        "khong duoc tat may",
        "khong lien he voi ai",
        "chi lam theo toi",
    ) or _has_pattern(text, r"khong duoc.{0,30}lien he voi ai")
    urgency = _has_pattern(
        text,
        r"(?:ngay lap tuc|\bngay\b|trong\s+\d+\s*phut|han cuoi|xu ly nhanh)",
    )
    safe_account_scam = _has_phrase(text, "tai khoan an toan", "tai khoan tam giu")
    remote_access_request = _has_phrase(text, "anydesk", "teamviewer", "dieu khien may")
    screen_sharing_request = _has_phrase(text, "chia se man hinh")
    otp_request = _has_pattern(
        text,
        r"(?:doc|gui|cung cap|nhap|xac nhan).{0,35}(?:ma\s+)?(?:otp|ma xac thuc|ma bao mat)|"
        r"(?:otp|ma xac thuc|ma bao mat).{0,35}(?:doc|gui|cung cap|nhap|xac nhan)",
    )
    credential_social_engineering = _has_pattern(
        text,
        r"(?:cho toi biet|cung cap|doc|gui|nhap).{0,35}(?:ma pin|so pin|mat khau|"
        r"thong tin bao mat)|(?:ma pin|so pin|mat khau|thong tin bao mat).{0,35}"
        r"(?:cho toi|cung cap|doc|gui|nhap)",
    ) or (otp_request and _has_phrase(text, "mo khoa", "xac minh", "ho tro"))
    direct_sensitive_credential = _has_pattern(
        text,
        r"(?:ma pin|so pin|mat khau).{0,35}(?:cho toi|cung cap|doc|gui)|"
        r"(?:cho toi biet|cung cap|doc|gui).{0,35}(?:ma pin|so pin|mat khau)",
    )
    money_transfer_request = _has_phrase(text, "chuyen tien", "chuyen khoan", "chuyen toan bo so tien") and (
        safe_account_scam
        or authority_impersonation
        or authority_claim
        or legal_threat
        or _has_phrase(text, "phai chuyen", "neu khong chuyen")
    )

    if authority_impersonation:
        add("authority_impersonation", "Caller tu xung la co quan/can bo")
    elif authority_claim:
        add("authority_claim", "Caller vien dan co quan dieu tra")
    if bank_impersonation:
        add("bank_impersonation", "Caller tu xung nhan vien/bao mat ngan hang")
    if legal_threat:
        add("legal_threat", "Caller neu de doa phap ly")
    if account_lock_threat:
        add("account_lock_threat", "Caller de doa khoa hoac phong toa tai khoan")
    if secrecy_request:
        add("secrecy_request", "Caller yeu cau giu bi mat")
    if prevent_external_verification:
        add("prevent_external_verification", "Caller ngan xac minh qua kenh chinh thuc")
    if urgency:
        add("urgency", "Caller thuc giuc xu ly gap")
    if otp_request:
        add("otp_request", "Caller yeu cau OTP hoac ma xac thuc")
    if credential_social_engineering:
        add("credential_social_engineering", "Caller yeu cau thong tin bao mat")
    if money_transfer_request:
        add("money_transfer_request", "Caller yeu cau chuyen tien trong ngu canh rui ro")
    if safe_account_scam:
        add("safe_account_scam", "Caller nhac tai khoan an toan hoac tam giu")
    if remote_access_request:
        add("remote_access_request", "Caller yeu cau phan mem dieu khien tu xa")
    if screen_sharing_request:
        add("screen_sharing_request", "Caller yeu cau chia se man hinh")

    critical = (
        (money_transfer_request and safe_account_scam)
        or (otp_request and (bank_impersonation or remote_access_request or credential_social_engineering))
        or (remote_access_request and credential_social_engineering)
        or direct_sensitive_credential
        or (authority_impersonation and account_lock_threat and secrecy_request)
        or (legal_threat and secrecy_request and urgency)
    )
    high = (
        (bank_impersonation and account_lock_threat and urgency)
        or (authority_claim and secrecy_request)
        or prevent_external_verification
        or otp_request
        or credential_social_engineering
        or remote_access_request
        or screen_sharing_request
        or (bank_impersonation and urgency)
    )
    warning = bank_impersonation or (
        _has_phrase(text, "tai khoan", "han cuoi") and _has_phrase(text, "co van de", "kiem tra som", "xu ly nhanh")
    )

    if critical:
        action, level, score = "STOP", "critical", 90
        explanation = "Phát hiện yêu cầu cung cấp thông tin bảo mật hoặc chuyển tiền đáng ngờ; hãy dừng cuộc gọi."
    elif high:
        action, level, score = "PAUSE", "high", 60
        explanation = "Có dấu hiệu rủi ro trong cuộc gọi; hãy tạm dừng và tự xác minh qua kênh chính thức."
    elif warning:
        action, level, score = "MONITOR", "warning", 30
        explanation = "Có dấu hiệu cần theo dõi; chưa nên thực hiện thao tác bảo mật hoặc chuyển tiền."
    else:
        return agent_result

    scenario = (
        "safe_account_scam"
        if safe_account_scam
        else "remote_access_scam"
        if remote_access_request
        else "otp_phishing"
        if otp_request
        else "authority_impersonation"
        if authority_impersonation or authority_claim
        else "bank_impersonation"
        if bank_impersonation
        else None
    )
    return GuardianRiskResult(
        risk_score=score,
        risk_level=level,
        scenario=scenario,
        recommended_action=action,
        explanation=explanation,
        signals=tuple(signals),
    )


def immediate_direct_evidence_result(
    state: GuardianConversationState,
) -> GuardianRiskResult | None:
    """Return an immediate direct-evidence decision without an LLM request.

    This protects explicit OTP/PIN, remote-access, screen-sharing, or coercive
    wording even while the provider is rate-limited or the normal model cadence
    intentionally skips short transcript fragments.
    """

    baseline = GuardianRiskResult(
        risk_score=0,
        risk_level="safe",
        scenario=None,
        recommended_action="CONTINUE",
        explanation="Chưa có tín hiệu rủi ro trực tiếp.",
        signals=(),
    )
    result = _direct_evidence_guardrail(state, baseline)
    return result if result.recommended_action != "CONTINUE" else None


def analyze_with_guardian_agent(
    state: GuardianConversationState,
    latest_text: str,
    *,
    apply_direct_guardrail: bool = True,
) -> GuardianRiskResult:
    """Ask the model for a risk decision, optionally applying the safety floor.

    Production callers keep ``apply_direct_guardrail=True``. The evaluation
    runner can disable it to measure the model's own classification rather
    than accidentally reporting the deterministic safety policy as model
    accuracy.
    """

    settings = get_settings()
    provider = guardian_provider_config(settings)
    if not settings.guardian_agent_enabled:
        raise GuardianAgentUnavailableError("Guardian risk agent đang bị tắt")
    if not provider.api_key:
        raise GuardianAgentUnavailableError("Thiếu API key cho Guardian risk agent")

    request: dict[str, Any] = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    _conversation_payload(state, latest_text),
                    ensure_ascii=False,
                ),
            },
        ],
        "temperature": 0,
        "max_completion_tokens": GUARDIAN_MAX_COMPLETION_TOKENS,
        "response_format": {"type": "json_object"},
    }
    if _is_gpt_oss_model(provider.model):
        # Groq defaults GPT-OSS to medium reasoning. This short, deterministic
        # classification task needs low effort: it avoids request timeouts and
        # leaves enough of the completion budget for the JSON contract.
        request["reasoning_effort"] = settings.guardian_agent_reasoning_effort
        # The installed OpenAI SDK exposes ``reasoning_effort`` directly but
        # not Groq's ``reasoning_format`` extension. Send only the extension
        # through extra_body so SDK argument validation does not reject it.
        request["extra_body"] = {"reasoning_format": "hidden"}

    try:
        response = _guardian_completion_with_key_failover(provider, request)
    except Exception as exc:
        raise GuardianAgentUnavailableError(
            "Không thể gọi Guardian risk agent",
            retry_after_seconds=_retry_after_seconds(exc),
        ) from exc

    decision = _parse_json(_response_text(response))
    agent_result = GuardianRiskResult(
        risk_score=decision.risk_score,
        risk_level=decision.risk_level,
        scenario=decision.scenario,
        recommended_action=decision.recommended_action,
        explanation=decision.explanation,
        signals=tuple(
            GuardianSignal(
                signal_type=signal.signal_type,
                weight=signal.weight,
                confidence=signal.confidence,
                evidence=signal.evidence,
            )
            for signal in decision.signals
        ),
    )
    return _direct_evidence_guardrail(state, agent_result) if apply_direct_guardrail else agent_result


def _guardian_completion_with_key_failover(
    provider: AgentProviderConfig,
    request: dict[str, Any],
) -> Any:
    """Call Guardian and advance to the next configured key after HTTP 429 only."""

    for index, api_key in enumerate(provider.api_keys):
        client = OpenAI(
            api_key=api_key,
            base_url=provider.base_url,
            # Do not wait through SDK retries for a quota that a backup key can
            # serve immediately. Other transport failures remain fail-closed.
            max_retries=0,
            timeout=20.0,
        )
        try:
            return _guardian_completion_with_json_fallback(client, request)
        except Exception as exc:
            if not is_rate_limit_error(exc) or index == len(provider.api_keys) - 1:
                raise
            # Never include a key, response body, or prompt content in logs.
            logger.warning("Guardian Agent is rate limited; trying a configured backup key")

    raise RuntimeError("Guardian Agent did not return a response")


def _guardian_completion_with_json_fallback(client: OpenAI, request: dict[str, Any]) -> Any:
    """Keep the existing local JSON fallback for provider validator failures."""

    try:
        return client.chat.completions.create(**request)
    except Exception as exc:
        if not _is_json_validation_failure(exc):
            raise

    # Groq's structured-output validator can run out of completion budget for
    # reasoning models and return HTTP 400 before emitting any text. The prompt
    # still requests JSON and _parse_json below still enforces the contract.
    logger.info("Guardian JSON mode rejected by provider; retrying local JSON validation")
    fallback_request = dict(request)
    fallback_request.pop("response_format")
    return client.chat.completions.create(**fallback_request)


def _is_json_validation_failure(exc: Exception) -> bool:
    """True only for Groq's server-side structured-output generation failure."""

    if getattr(exc, "status_code", None) != 400:
        return False
    message = str(exc).lower()
    return "json_validate_failed" in message or "failed to validate json" in message


def _is_gpt_oss_model(model: str) -> bool:
    """Whether a Groq model supports the low reasoning-effort controls."""

    return model.strip().lower().startswith("openai/gpt-oss-")


def _retry_after_seconds(exc: Exception) -> float:
    """Extract provider backoff without exposing response bodies or secrets."""

    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers is not None:
        try:
            value = headers.get("retry-after") or headers.get("Retry-After")
            if value is not None:
                return min(300.0, max(1.0, float(value)))
        except (TypeError, ValueError):
            pass
    status_code = getattr(exc, "status_code", None)
    message = str(exc).lower()
    if status_code == 429 or "rate limit" in message or "rate_limit" in message:
        match = re.search(
            r"try again in\s*(?:(\d+)m)?\s*(\d+(?:\.\d+)?)s",
            message,
        )
        if match:
            minutes = float(match.group(1) or 0)
            seconds = float(match.group(2))
            return min(300.0, max(1.0, minutes * 60 + seconds))
        # Groq may omit Retry-After for daily token quotas. Avoid hammering it.
        return 60.0
    return 0.0


def fail_closed_guardian_result(reason: str) -> GuardianRiskResult:
    """Return a safe emergency decision when the agent is unavailable.

    This is not a substitute risk model and does not calculate a threshold.
    It is an explicit fail-closed safety action: backend may pause/stop a
    dangerous transaction until an agent decision is available again.
    """

    return _agent_unavailable_result(reason, stop=True)


def degraded_guardian_result(reason: str) -> GuardianRiskResult:
    """Represent a short provider outage without raising a critical alert."""

    return _agent_unavailable_result(reason, stop=False)


def _agent_unavailable_result(reason: str, *, stop: bool) -> GuardianRiskResult:
    action = "STOP" if stop else "PAUSE"
    level = "critical" if stop else "high"
    return GuardianRiskResult(
        risk_score=100,
        risk_level=level,
        scenario="agent_unavailable",
        recommended_action=action,
        explanation=(f"Guardian Risk Agent tạm thời không phản hồi; hệ thống tạm dừng để bảo vệ giao dịch ({reason})."),
        signals=(
            GuardianSignal(
                signal_type="agent_unavailable",
                weight=100,
                confidence=1.0,
                evidence="agent_unavailable",
            ),
        ),
    )
