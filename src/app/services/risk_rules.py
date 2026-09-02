"""Deterministic risk rules used before any ML or LangGraph enrichment.

The functions return structured candidates. The API persists those candidates to
``risk_signals`` so a later model/rule version never overwrites past evidence.
"""

from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import median

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from src.app.models.blacklist import Blacklist
from src.app.models.risk_assessment import RiskLevel
from src.app.models.scam_pattern import ScamPattern
from src.app.models.transaction import Transaction, TransactionStatus
from src.app.models.transaction_risk_context import TransactionRiskContext
from src.app.models.trusted_recipient import TrustedRecipient
from src.app.schemas.risk import AssessRequest
from src.app.services.bank_normalization import normalize_bank_name
from src.app.services.transaction_telemetry import RiskTelemetry

LARGE_AMOUNT_VND = 20_000_000
BEHAVIORAL_AMOUNT_MIN_VND = 5_000_000
BEHAVIORAL_AMOUNT_MULTIPLIER = 10
BEHAVIOR_HISTORY_DAYS = 90
VELOCITY_WINDOW = timedelta(minutes=5)
VELOCITY_RECIPIENT_THRESHOLD = 10
DEVICE_HISTORY_DAYS = 30
MAX_LOCATION_ACCURACY_M = 50_000
IMPOSSIBLE_TRAVEL_WINDOW = timedelta(minutes=15)
IMPOSSIBLE_TRAVEL_DISTANCE_KM = 100
RULES_VERSION = "rules-2026-08-15-behavioral-v1"

URGENCY_KEYWORDS = (
    "gap",
    "khan cap",
    "ngay lap tuc",
    "cong an",
    "vien kiem sat",
    "phong toa",
    "trung thuong",
    "dau tu",
    "loi nhuan cao",
)

# These phrases are explicit scam indicators requested by the product. Values
# are labels only; raw transfer notes are never persisted as evidence.
SCAM_KEYWORDS = (
    ("ma otp", "mã OTP"),
    ("hoan tien", "hoàn tiền"),
    ("buu dien", "bưu điện"),
    ("cong an", "công an"),
    ("tam giu", "tạm giữ"),
    ("tai khoan vi pham", "tài khoản vi phạm"),
)

# A transfer that refers to claiming a prize or gift is not proof of fraud on
# its own.  It is nevertheless a useful, explainable signal: prize scams
# commonly ask the victim to transfer a "fee" or "deposit" before a supposed
# reward can be received.  Keep this separate from the explicit scam-keyword
# list above so the UI and Risk Coach can explain the distinction clearly.
REWARD_CLAIM_KEYWORDS = (
    "nhan thuong",
    "trung thuong",
    "nhan qua",
    "qua tang",
    "nhan uu dai",
)

SUSPICIOUS_URL_MARKERS = ("http://", "https://", "www.", ".xyz", ".top", ".click")


@dataclass(frozen=True)
class RiskSignalCandidate:
    signal_type: str
    severity: str
    score: float
    explanation: str
    matched_blacklist_id: object | None = None
    matched_pattern_id: object | None = None
    evidence: dict | None = None


def _mask_account(account: str) -> str:
    compact = account.replace(" ", "").strip()
    return f"***{compact[-4:]}" if len(compact) > 4 else "[masked]"


def _format_vnd(value: int | float) -> str:
    return f"{value:,.0f}".replace(",", ".")


def _fold_text(value: str) -> str:
    """Case- and accent-insensitive text for Vietnamese keyword matching."""
    decomposed = unicodedata.normalize("NFD", value.casefold())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn").replace("đ", "d")


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _blacklist_signal(db: Session, request: AssessRequest) -> RiskSignalCandidate | None:
    """Only an exact account + bank match creates a blacklist signal."""
    if not request.bank_code:
        return None

    account = request.payee_account.replace(" ", "").strip()
    expected_bank = normalize_bank_name(request.bank_code)
    entries = db.scalars(
        select(Blacklist).where(
            Blacklist.is_active.is_(True),
            Blacklist.entity_type == "account",
            Blacklist.entity_value == account,
        )
    ).all()
    entry = next(
        (candidate for candidate in entries if normalize_bank_name(candidate.bank) == expected_bank),
        None,
    )
    if entry is None:
        return None

    score = max(0.75, min(1.0, float(entry.risk_score)))
    return RiskSignalCandidate(
        signal_type="blacklist_exact_match",
        severity="high",
        score=score,
        explanation=f"Tài khoản {_mask_account(account)} đã được đánh dấu cần thận trọng.",
        matched_blacklist_id=entry.id,
        evidence={"source": entry.source, "match": "account_and_bank"},
    )


def _trusted_recipient_signal(db: Session, user_id: object, request: AssessRequest) -> RiskSignalCandidate | None:
    query = select(TrustedRecipient).where(
        TrustedRecipient.user_id == user_id,
        TrustedRecipient.account_number == request.payee_account.replace(" ", "").strip(),
    )
    if request.bank_code:
        query = query.where(TrustedRecipient.bank_code == request.bank_code)
    recipient = db.scalar(query)
    if recipient is None:
        return None
    return RiskSignalCandidate(
        signal_type="trusted_recipient",
        severity="info",
        score=-0.25,
        explanation="Người nhận đã được bạn đánh dấu là tin cậy.",
    )


def _new_payee_signal(db: Session, user_id: object, request: AssessRequest) -> RiskSignalCandidate | None:
    query = select(Transaction.id).where(
        Transaction.user_id == user_id,
        Transaction.payee_account == request.payee_account.replace(" ", "").strip(),
        Transaction.transaction_status == TransactionStatus.COMPLETED,
    )
    if request.bank_code:
        query = query.where(Transaction.bank_code == request.bank_code)
    if db.scalar(query.limit(1)) is not None:
        return None
    return RiskSignalCandidate(
        signal_type="new_payee",
        severity="low",
        score=0.20,
        explanation="Bạn chưa từng chuyển tiền cho người nhận này.",
    )


def _amount_signal(amount: int) -> RiskSignalCandidate | None:
    if amount < LARGE_AMOUNT_VND:
        return None
    return RiskSignalCandidate(
        signal_type="unusual_amount",
        severity="medium",
        score=0.20,
        explanation=f"Số tiền vượt ngưỡng cảnh báo ({_format_vnd(LARGE_AMOUNT_VND)} đ).",
    )


def _behavioral_amount_signal(db: Session, user_id: object, request: AssessRequest) -> RiskSignalCandidate | None:
    """Compare against the user's recent *completed* outgoing transfers."""
    cutoff = _utcnow() - timedelta(days=BEHAVIOR_HISTORY_DAYS)
    historical_amounts = [
        int(amount)
        for amount in db.scalars(
            select(Transaction.amount)
            .where(
                Transaction.user_id == user_id,
                Transaction.transaction_status == TransactionStatus.COMPLETED,
                Transaction.created_at >= cutoff,
            )
            .order_by(desc(Transaction.created_at))
            .limit(50)
        ).all()
    ]
    if len(historical_amounts) < 3:
        return None

    baseline = max(1, int(median(historical_amounts)))
    multiple = request.amount / baseline
    multiple_label = f"{multiple:,.0f}".replace(",", ".")
    if request.amount < BEHAVIORAL_AMOUNT_MIN_VND or multiple < BEHAVIORAL_AMOUNT_MULTIPLIER:
        return None
    return RiskSignalCandidate(
        signal_type="behavioral_amount_anomaly",
        severity="high",
        score=0.45,
        explanation=f"Số tiền cao hơn khoảng {multiple_label} lần mức thường lệ của bạn.",
        evidence={
            "baseline_sample_size": len(historical_amounts),
            "median_amount_vnd": baseline,
            "amount_multiple": round(multiple, 1),
            "history_window_days": BEHAVIOR_HISTORY_DAYS,
        },
    )


def _recipient_key(account: str, bank_code: str | None) -> tuple[str, str]:
    return (
        normalize_bank_name(bank_code) if bank_code else "",
        account.replace(" ", "").strip(),
    )


def _transaction_velocity_signal(db: Session, user_id: object, request: AssessRequest) -> RiskSignalCandidate | None:
    """Detect a burst to many distinct recipients, never just many retries."""
    cutoff = _utcnow() - VELOCITY_WINDOW
    previous_recipients = {
        _recipient_key(account, bank_code)
        for account, bank_code in db.execute(
            select(Transaction.payee_account, Transaction.bank_code).where(
                Transaction.user_id == user_id,
                Transaction.transaction_status == TransactionStatus.COMPLETED,
                Transaction.created_at >= cutoff,
            )
        ).all()
    }
    previous_recipients.add(_recipient_key(request.payee_account, request.bank_code))
    recipient_count = len(previous_recipients)
    if recipient_count < VELOCITY_RECIPIENT_THRESHOLD:
        return None
    return RiskSignalCandidate(
        signal_type="transaction_velocity",
        severity="high",
        score=0.65,
        explanation=(
            f"Bạn đang chuyển cho {recipient_count} người nhận trong {int(VELOCITY_WINDOW.total_seconds() // 60)} phút."
        ),
        evidence={
            "distinct_recipient_count": recipient_count,
            "window_seconds": int(VELOCITY_WINDOW.total_seconds()),
        },
    )


def _haversine_distance_km(latitude_a: int, longitude_a: int, latitude_b: int, longitude_b: int) -> float:
    """Distance between coarse E2 latitude/longitude points."""
    lat_a, lon_a = math.radians(latitude_a / 100), math.radians(longitude_a / 100)
    lat_b, lon_b = math.radians(latitude_b / 100), math.radians(longitude_b / 100)
    sin_lat = math.sin((lat_b - lat_a) / 2)
    sin_lon = math.sin((lon_b - lon_a) / 2)
    arc = sin_lat**2 + math.cos(lat_a) * math.cos(lat_b) * sin_lon**2
    return 6371.0 * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))


def collect_telemetry_signals(
    db: Session, user_id: object, telemetry: RiskTelemetry | None
) -> list[RiskSignalCandidate]:
    """Compare pseudonymous context with recent activity without raw tracking."""
    if telemetry is None or not telemetry.has_any_value:
        return []

    cutoff = telemetry.observed_at - timedelta(days=DEVICE_HISTORY_DAYS)
    contexts = db.scalars(
        select(TransactionRiskContext)
        .where(
            TransactionRiskContext.user_id == user_id,
            TransactionRiskContext.created_at >= cutoff,
        )
        .order_by(desc(TransactionRiskContext.created_at))
        .limit(100)
    ).all()
    signals: list[RiskSignalCandidate] = []

    known_devices = {context.device_hash for context in contexts if context.device_hash}
    if telemetry.device_hash and known_devices and telemetry.device_hash not in known_devices:
        signals.append(
            RiskSignalCandidate(
                signal_type="new_device",
                severity="low",
                score=0.12,
                explanation="Thiết bị này chưa từng được dùng gần đây.",
                evidence={"history_window_days": DEVICE_HISTORY_DAYS},
            )
        )

    known_networks = {context.ip_hash for context in contexts if context.ip_hash}
    if telemetry.ip_hash and known_networks and telemetry.ip_hash not in known_networks:
        signals.append(
            RiskSignalCandidate(
                signal_type="new_network",
                severity="low",
                score=0.08,
                explanation="Mạng kết nối này chưa từng xuất hiện gần đây.",
                evidence={"history_window_days": DEVICE_HISTORY_DAYS},
            )
        )

    if (
        not telemetry.has_location
        or telemetry.geo_accuracy_m is None
        or telemetry.geo_accuracy_m > MAX_LOCATION_ACCURACY_M
    ):
        return signals

    previous_location = next(
        (
            context
            for context in contexts
            if context.geo_lat_e2 is not None
            and context.geo_lon_e2 is not None
            and context.geo_accuracy_m is not None
            and context.geo_accuracy_m <= MAX_LOCATION_ACCURACY_M
        ),
        None,
    )
    if previous_location is None:
        return signals

    previous_time = previous_location.created_at
    if previous_time.tzinfo is None:
        previous_time = previous_time.replace(tzinfo=UTC)
    elapsed_seconds = (telemetry.observed_at - previous_time).total_seconds()
    if elapsed_seconds <= 0 or elapsed_seconds > IMPOSSIBLE_TRAVEL_WINDOW.total_seconds():
        return signals
    distance_km = _haversine_distance_km(
        previous_location.geo_lat_e2,
        previous_location.geo_lon_e2,
        telemetry.geo_lat_e2,
        telemetry.geo_lon_e2,
    )
    if distance_km < IMPOSSIBLE_TRAVEL_DISTANCE_KM:
        return signals

    signals.append(
        RiskSignalCandidate(
            signal_type="impossible_travel",
            severity="high",
            score=0.65,
            explanation="Vị trí thay đổi bất thường trong thời gian rất ngắn.",
            evidence={
                "distance_km": round(distance_km),
                "elapsed_minutes": round(elapsed_seconds / 60, 1),
                "location_precision": "coarse_opt_in",
            },
        )
    )
    return signals


# Kept as a private alias for existing focused tests and internal callers.
def _telemetry_signals(db: Session, user_id: object, telemetry: RiskTelemetry | None) -> list[RiskSignalCandidate]:
    return collect_telemetry_signals(db, user_id, telemetry)


def _note_signals(note: str | None) -> list[RiskSignalCandidate]:
    if not note:
        return []

    lowered = _fold_text(note)
    signals: list[RiskSignalCandidate] = []
    matched = sorted({keyword for keyword in URGENCY_KEYWORDS if keyword in lowered})
    if matched:
        signals.append(
            RiskSignalCandidate(
                signal_type="suspicious_note",
                severity="medium",
                score=0.25,
                explanation="Nội dung tạo cảm giác phải chuyển tiền gấp.",
                evidence={"matched_keyword_count": len(matched)},
            )
        )
    matched_scam_categories = sorted(label for keyword, label in SCAM_KEYWORDS if keyword in lowered)
    if matched_scam_categories:
        signals.append(
            RiskSignalCandidate(
                signal_type="scam_keyword",
                severity="medium",
                score=0.30,
                explanation="Nội dung có dấu hiệu lừa đảo hoặc mạo danh.",
                evidence={
                    "matched_categories": matched_scam_categories,
                    "matched_keyword_count": len(matched_scam_categories),
                },
            )
        )
    matched_reward_cues = sorted({keyword for keyword in REWARD_CLAIM_KEYWORDS if keyword in lowered})
    if matched_reward_cues:
        signals.append(
            RiskSignalCandidate(
                signal_type="reward_claim_note",
                severity="medium",
                score=0.25,
                explanation=(
                    "Nội dung nhắc đến nhận thưởng hoặc quà tặng; hãy cảnh giác nếu bị "
                    "yêu cầu chuyển phí hay đặt cọc trước."
                ),
                evidence={"matched_cue_count": len(matched_reward_cues)},
            )
        )
    if any(marker in lowered for marker in SUSPICIOUS_URL_MARKERS):
        signals.append(
            RiskSignalCandidate(
                signal_type="suspicious_link",
                severity="medium",
                score=0.20,
                explanation="Nội dung có đường dẫn cần kiểm tra.",
            )
        )
    return signals


def _pattern_signals(db: Session, note: str | None) -> list[RiskSignalCandidate]:
    if not note:
        return []
    lowered = note.lower()
    matches: list[RiskSignalCandidate] = []
    patterns = db.scalars(select(ScamPattern).where(ScamPattern.is_active.is_(True))).all()
    for pattern in patterns:
        keywords = pattern.keywords or []
        if not any(keyword.lower() in lowered for keyword in keywords):
            continue
        score = min(0.40, max(0.10, float(pattern.risk_weight)))
        matches.append(
            RiskSignalCandidate(
                signal_type="scam_pattern_match",
                severity="high" if score >= 0.30 else "medium",
                score=score,
                explanation="Nội dung giao dịch trùng với một mẫu lừa đảo đã được cảnh báo.",
                matched_pattern_id=pattern.id,
                evidence={"pattern_name": pattern.pattern_name},
            )
        )
    return matches[:3]


def collect_signals(
    db: Session,
    user_id: object,
    request: AssessRequest,
    telemetry: RiskTelemetry | None = None,
) -> list[RiskSignalCandidate]:
    behavioral_amount = _behavioral_amount_signal(db, user_id, request)
    candidates = [
        _blacklist_signal(db, request),
        _trusted_recipient_signal(db, user_id, request),
        _new_payee_signal(db, user_id, request),
        behavioral_amount or _amount_signal(request.amount),
        _transaction_velocity_signal(db, user_id, request),
    ]
    signals = [candidate for candidate in candidates if candidate is not None]
    signals.extend(_note_signals(request.note))
    signals.extend(_pattern_signals(db, request.note))
    signals.extend(collect_telemetry_signals(db, user_id, telemetry))
    return signals


def score_from_signals(signals: list[RiskSignalCandidate]) -> tuple[float, str]:
    positive = [signal for signal in signals if signal.score > 0]
    has_exact_blacklist = any(signal.signal_type == "blacklist_exact_match" for signal in positive)
    trusted = any(signal.signal_type == "trusted_recipient" for signal in signals)
    score = sum(signal.score for signal in signals)
    if trusted and not has_exact_blacklist:
        score = max(0.0, score - 0.15)

    strong_signal_count = sum(
        1
        for signal in positive
        if signal.severity == "high"
        or signal.signal_type in {"suspicious_note", "suspicious_link", "behavioral_amount_anomaly"}
    )
    high_confidence_signal = any(
        signal.signal_type in {"blacklist_exact_match", "transaction_velocity", "impossible_travel"}
        for signal in positive
    )
    behavioral_amount_to_new_payee = {"behavioral_amount_anomaly", "new_payee"}.issubset(
        {signal.signal_type for signal in positive}
    )
    if (
        not has_exact_blacklist
        and not high_confidence_signal
        and not behavioral_amount_to_new_payee
        and strong_signal_count < 2
        and score >= 0.60
    ):
        score = 0.59
    score = round(max(0.0, min(1.0, score)), 4)
    if score == 0:
        return score, RiskLevel.SAFE
    if score < 0.30:
        return score, RiskLevel.LOW
    if score < 0.60:
        return score, RiskLevel.MEDIUM
    return score, RiskLevel.HIGH


def build_explanation(level: str, signals: list[RiskSignalCandidate]) -> str:
    risk_signals = [signal for signal in signals if signal.score > 0]
    safeguards = [signal for signal in signals if signal.score < 0]
    if not risk_signals:
        return "Không phát hiện dấu hiệu rủi ro đáng kể từ các rule hiện có."

    lines = ["Điểm cần lưu ý:"]
    lines.extend(f"- {signal.explanation}" for signal in risk_signals)
    if safeguards:
        lines.append("Điểm an toàn:")
        lines.extend(f"- {signal.explanation}" for signal in safeguards)
    return "\n".join(lines)


def recommendation(level: str) -> str:
    if level == RiskLevel.HIGH:
        return "Khuyến nghị tạm dừng và xác minh người nhận qua một kênh liên lạc độc lập."
    if level == RiskLevel.MEDIUM:
        return "Hãy kiểm tra lại người nhận trước khi tiếp tục giao dịch."
    return "Bạn vẫn là người quyết định cuối cùng cho giao dịch này."


def verification_questions(level: str) -> list[str]:
    if level == RiskLevel.HIGH:
        return [
            "Bạn đã gọi trực tiếp cho người nhận để xác nhận yêu cầu này chưa?",
            "Bạn có bị yêu cầu chuyển gấp hoặc giữ bí mật không?",
            "Bạn đã đối chiếu lại số tài khoản và ngân hàng chưa?",
        ]
    if level == RiskLevel.MEDIUM:
        return ["Bạn đã xác minh lại thông tin người nhận qua kênh độc lập chưa?"]
    return []
