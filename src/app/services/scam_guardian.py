"""Offline deterministic conversation evaluator for Guardian tests.

The production realtime path uses :mod:`scam_guardian_agent`; this evaluator
is retained for local regression/evaluation and never owns production
thresholds. It never treats an isolated word such as "ngân hàng" as a scam.
Signals become meaningful when a caller combines identity impersonation with
threats, secrecy, urgency, credentials, remote access, or money movement.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field

# The realtime agent needs enough context to recognize a scam pattern, but it
# should never receive an unbounded call history. Twelve short speech turns is
# roughly the latest 15–30 seconds in the normal browser capture cadence.
MAX_ROLLING_GUARDIAN_SEGMENTS = 12


@dataclass(frozen=True)
class GuardianSignal:
    signal_type: str
    weight: int
    confidence: float
    evidence: str


@dataclass(frozen=True)
class GuardianRiskResult:
    risk_score: int
    risk_level: str
    scenario: str | None
    recommended_action: str
    explanation: str
    signals: tuple[GuardianSignal, ...]


@dataclass
class GuardianConversationState:
    segments: list[tuple[str, str]] = field(default_factory=list)

    def append(self, speaker: str, text: str) -> None:
        self.segments.append((speaker, text))
        if len(self.segments) > MAX_ROLLING_GUARDIAN_SEGMENTS:
            del self.segments[:-MAX_ROLLING_GUARDIAN_SEGMENTS]


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.lower())
    return "".join(character for character in decomposed if not unicodedata.combining(character)).replace("đ", "d")


def _contains(text: str, phrases: Iterable[str]) -> str | None:
    for phrase in phrases:
        if phrase in text:
            return phrase
    return None


def _has_identity_impersonation(text: str) -> str | None:
    identity = (
        "cong an",
        "can bo cong an",
        "co quan dieu tra",
        "vien kiem sat",
        "toa an",
        "nhan vien ngan hang",
        "can bo ngan hang",
        "nhan vien bao hiem",
    )
    if not any(phrase in text for phrase in identity):
        return None
    prefix = re.search(
        r"(toi la|day la|chung toi la|nhan danh|goi tu).{0,55}"
        r"(cong an|can bo cong an|co quan dieu tra|vien kiem sat|toa an|"
        r"nhan vien ngan hang|can bo ngan hang|nhan vien bao hiem)",
        text,
    )
    return prefix.group(0) if prefix else None


def _has_legal_threat(text: str) -> str | None:
    patterns = (
        r"tai khoan.{0,60}(lien quan|rua tien|bi khoa|bi dieu tra|vi pham)",
        r"(lien quan|rua tien|vi pham).{0,60}(tai khoan|phap luat|vu an)",
        r"(tam giu|bat|khoi to|truy to).{0,60}(tai khoan|anh|chi|ban)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _has_bank_impersonation(text: str) -> str | None:
    """Match a caller claiming to represent a bank or bank security team."""
    patterns = (
        r"(toi la|day la|goi tu|nhan danh).{0,45}"
        r"(nhan vien ngan hang|can bo ngan hang|bo phan bao mat|trung tam ho tro)",
        r"(nhan vien ngan hang|can bo ngan hang|bo phan bao mat).{0,45}" r"(yeu cau|de nghi|thong bao|goi cho)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _has_urgency(text: str) -> str | None:
    patterns = (
        r"(lam ngay|ngay lap tuc|thuc hien ngay|xu ly ngay)",
        r"(trong|trong vong)\s*\d+\s*(phut|gio|giay)",
        r"(khong con nhieu thoi gian|can gap|khan cap|han cuoi)",
        r"neu khong.{0,45}(bi khoa|mat quyen|khong kip|se bi)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _has_account_lock_threat(text: str) -> str | None:
    patterns = (
        r"tai khoan.{0,45}(bi khoa|se bi khoa|khoa ngay|bi tam khoa|bi phong toa|"
        r"bi vo hieu hoa|dong bang|mat quyen truy cap)",
        r"(bi khoa|se bi khoa|khoa ngay|bi tam khoa|bi phong toa|bi vo hieu hoa).{0,45}" r"tai khoan",
        r"(khoa|phong toa|vo hieu hoa|dong bang).{0,30}(ngay lap tuc|trong hom nay|neu khong)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def _has_credential_social_engineering(text: str) -> str | None:
    credentials = (
        "otp",
        "ma xac thuc",
        "ma bao mat",
        "ma pin",
        "so pin",
        "mat khau",
        "ten dang nhap",
    )
    actions = (
        "doc",
        "cung cap",
        "gui",
        "cho toi",
        "nhap",
        "xac nhan",
        "noi",
        "viet",
    )
    for credential in credentials:
        for action in actions:
            match = re.search(
                rf"{action}.{{0,35}}{re.escape(credential)}|" rf"{re.escape(credential)}.{{0,35}}{action}",
                text,
            )
            if match:
                return match.group(0)
    return None


def _has_otp_request(text: str) -> str | None:
    actions = (
        "doc",
        "cung cap",
        "gui",
        "cho toi",
        "nhap",
        "xac nhan",
        "noi",
    )
    credentials = ("otp", "ma xac thuc", "ma bao mat")
    for credential in credentials:
        for action in actions:
            match = re.search(
                rf"{action}.{{0,30}}{re.escape(credential)}|" rf"{re.escape(credential)}.{{0,30}}{action}",
                text,
            )
            if match:
                return match.group(0)
    return None


def _has_external_verification_prevention(text: str) -> str | None:
    phrases = (
        "khong duoc goi ngan hang",
        "dung goi ngan hang",
        "khong can goi tong dai",
        "khong duoc tu xac minh",
        "khong duoc tu kiem tra",
        "khong duoc xac minh voi ai",
        "khong duoc ngat may",
        "dung ngat may",
        "chi duoc lam theo toi",
        "khong can hoi lai",
        "khong duoc noi voi ai",
        "dung noi cho nguoi khac",
        "giu bi mat",
    )
    return _contains(text, phrases)


def _has_authority_claim(text: str) -> str | None:
    patterns = (
        r"(toi la|day la|nhan danh|goi tu).{0,55}"
        r"(cong an|co quan dieu tra|vien kiem sat|toa an|thanh tra|"
        r"nhan vien ngan hang|can bo ngan hang|bo phan bao mat)",
        r"(cong an|co quan dieu tra|vien kiem sat|toa an|nhan vien ngan hang|"
        r"can bo ngan hang).{0,35}"
        r"(yeu cau|chi dao|thong bao|de nghi)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def analyze_guardian_state(state: GuardianConversationState) -> GuardianRiskResult:
    """Analyze transcript for offline regression tests, not live enforcement."""
    transcript = " ".join(text for _speaker, text in state.segments)
    text = _normalize(transcript)
    signals: list[GuardianSignal] = []

    def add(signal_type: str, weight: int, evidence: str | None) -> None:
        if evidence:
            signals.append(
                GuardianSignal(
                    signal_type=signal_type,
                    weight=weight,
                    confidence=1.0,
                    evidence=evidence,
                )
            )

    add(
        "authority_impersonation",
        20,
        _has_identity_impersonation(text),
    )
    add(
        "authority_claim",
        18,
        _has_authority_claim(text),
    )
    add(
        "bank_impersonation",
        22,
        _has_bank_impersonation(text),
    )
    add("legal_threat", 15, _has_legal_threat(text))
    add("account_lock_threat", 24, _has_account_lock_threat(text))
    add(
        "secrecy_request",
        15,
        _contains(
            text,
            (
                "khong duoc noi voi ai",
                "khong duoc noi chuyen nay",
                "giu bi mat",
                "dung noi cho nguoi khac",
                "tuyet doi bi mat",
            ),
        ),
    )
    add(
        "urgent_action",
        10,
        _has_urgency(text),
    )
    add(
        "urgency",
        12,
        _has_urgency(text),
    )
    add(
        "otp_request",
        30,
        _has_otp_request(text),
    )
    add(
        "credential_request",
        40,
        _contains(
            text,
            (
                "mat khau",
                "ma pin",
                "so pin",
                "ten dang nhap",
            ),
        ),
    )
    add(
        "credential_social_engineering",
        28,
        _has_credential_social_engineering(text),
    )
    add(
        "prevent_external_verification",
        25,
        _has_external_verification_prevention(text),
    )
    add(
        "money_transfer_request",
        30,
        _contains(
            text,
            (
                "chuyen tien",
                "chuyen khoan",
                "nop tien",
                "gui tien",
                "chuyen 50",
                "chuyen vao tai khoan",
            ),
        ),
    )
    add(
        "safe_account_scam",
        40,
        _contains(
            text,
            (
                "tai khoan an toan",
                "tai khoan trung gian",
                "tai khoan xac minh",
                "tai khoan tam giu",
            ),
        ),
    )
    add(
        "remote_access_request",
        40,
        _contains(
            text,
            (
                "anydesk",
                "teamviewer",
                "cai ung dung",
                "cai app",
                "cho phep dieu khien",
                "dieu khien tu xa",
            ),
        ),
    )
    add(
        "screen_sharing_request",
        30,
        _contains(
            text,
            (
                "chia se man hinh",
                "bat ghi man hinh",
                "quay man hinh",
                "cho xem man hinh",
            ),
        ),
    )

    by_type = {signal.signal_type: signal for signal in signals}
    bonus = 0
    if {"authority_impersonation", "legal_threat"} <= by_type.keys():
        bonus += 15
    if {"legal_threat", "secrecy_request"} <= by_type.keys():
        bonus += 10
    if {"money_transfer_request", "safe_account_scam"} <= by_type.keys():
        bonus += 20
    if {"otp_request", "money_transfer_request"} <= by_type.keys():
        bonus += 15
    if {"bank_impersonation", "authority_claim"} <= by_type.keys():
        bonus += 10
    if {"authority_claim", "account_lock_threat"} <= by_type.keys():
        bonus += 15
    if {"prevent_external_verification", "authority_claim"} <= by_type.keys():
        bonus += 10
    if {"otp_request", "credential_social_engineering"} <= by_type.keys():
        bonus += 10
    if {"urgency", "account_lock_threat"} <= by_type.keys():
        bonus += 10

    # Legacy signal names are retained for audit compatibility, but aliases
    # must not double-count the same evidence. For example, an account-lock
    # phrase can satisfy both legal_threat and account_lock_threat.
    alias_groups = (
        {"authority_impersonation", "authority_claim"},
        {"urgent_action", "urgency"},
        {"legal_threat", "account_lock_threat"},
        {"credential_request", "credential_social_engineering"},
    )
    counted: set[str] = set()
    base_score = 0
    for aliases in alias_groups:
        matching = [signal for signal in signals if signal.signal_type in aliases]
        if matching:
            base_score += max(signal.weight for signal in matching)
            counted.update(signal.signal_type for signal in matching)
    base_score += sum(signal.weight for signal in signals if signal.signal_type not in counted)
    score = min(100, base_score + bonus)
    if score >= 80:
        level = "critical"
        action = "STOP"
    elif score >= 60:
        level = "high"
        action = "PAUSE"
    elif score >= 30:
        level = "warning"
        action = "MONITOR"
    else:
        level = "safe"
        action = "CONTINUE"

    scenario: str | None = None
    if "safe_account_scam" in by_type:
        scenario = "safe_account_scam"
    elif "bank_impersonation" in by_type:
        scenario = "bank_impersonation"
    elif "remote_access_request" in by_type:
        scenario = "remote_access_scam"
    elif "otp_request" in by_type:
        scenario = "otp_phishing"
    elif "authority_impersonation" in by_type:
        scenario = "authority_impersonation"

    if not signals:
        explanation = "Chưa phát hiện tín hiệu lừa đảo rõ ràng trong các đoạn thoại đã nhận."
    else:
        names = ", ".join(signal.signal_type.replace("_", " ") for signal in signals[:4])
        explanation = f"Đã phát hiện: {names}."
        if action == "STOP":
            explanation += " Hãy dừng cuộc gọi và không chuyển tiền hoặc cung cấp mã bảo mật."
        elif action == "PAUSE":
            explanation += " Hãy tạm dừng, tự xác minh qua kênh chính thức trước khi làm theo."

    return GuardianRiskResult(
        risk_score=score,
        risk_level=level,
        scenario=scenario,
        recommended_action=action,
        explanation=explanation,
        signals=tuple(signals),
    )
