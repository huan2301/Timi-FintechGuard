"""Sinh loi giai thich + khuyen nghi + cau hoi xac minh.

Ban hien tai la template deterministic, chi dien dat lai cac tin hieu da kich
hoat — dung nguyen tac "giai thich dua tren du lieu doi chieu thuc te, khong tu
suy dien". O sprint sau, LangGraph agent se thay ham explain() bang LLM + RAG,
nhung van nhan dung list[RiskSignal] nay lam input.
"""

from sqlalchemy.orm import Session

from src.app.models import Blacklist  # ✅ Dung dung model tu models.py
from src.app.models.transaction import RiskLevel
from src.app.schemas.risk import RiskSignal

_LEVEL_INTRO = {
    RiskLevel.LOW: "Giao dich nay khong co dau hieu bat thuong.",
    RiskLevel.MEDIUM: "Giao dich nay co mot so dau hieu can ban luu y.",
    RiskLevel.HIGH: "Giao dich nay co nhieu dau hieu rui ro cao cua lua dao.",
}

_LEVEL_RECOMMENDATION = {
    RiskLevel.LOW: "Ban co the tiep tuc giao dich.",
    RiskLevel.MEDIUM: (
        "Hay xac minh lai nguoi nhan qua mot kenh lien lac khac (goi dien truc tiep) truoc khi chuyen tien."
    ),
    RiskLevel.HIGH: (
        "Chung toi khuyen nghi ban TAM DUNG giao dich va xac minh truc tiep voi "
        "nguoi nhan qua so dien thoai ban da biet. Quyet dinh cuoi cung van "
        "thuoc ve ban."
    ),
}

# Cau hoi xac minh cho luong HITL khi rui ro cao (yeu cau 5.3: 2-3 cau).
_HIGH_RISK_QUESTIONS = [
    "Ban co goi dien truc tiep cho nguoi nhan de xac nhan yeu cau chuyen tien nay khong?",
    "Nguoi nhan co yeu cau ban chuyen tien gap hoac giu bi mat voi nguoi khac khong?",
    "Ban co chac so tai khoan nay la cua dung nguoi ban dinh chuyen tien?",
]

_MEDIUM_RISK_QUESTIONS = [
    "Ban da tung giao dich voi nguoi nhan nay truoc day chua?",
]


def explain(risk_level: RiskLevel, signals: list[RiskSignal]) -> str:
    """Ghep loi giai thich tu cac tin hieu thuc te da kich hoat."""
    lines = [_LEVEL_INTRO[risk_level]]

    # Chi liet ke tin hieu lam tang rui ro; tin hieu giam neu rieng.
    risk_increasing = [s for s in signals if s.weight > 0]
    risk_reducing = [s for s in signals if s.weight < 0]

    if risk_increasing:
        lines.append("\nLy do canh bao:")
        lines.extend(f"- {s.label}" + (f": {s.detail}" if s.detail else "") for s in risk_increasing)

    if risk_reducing:
        lines.append("\nYeu to lam giam rui ro:")
        lines.extend(f"- {s.label}" + (f": {s.detail}" if s.detail else "") for s in risk_reducing)

    return "\n".join(lines)


def recommend(risk_level: RiskLevel) -> str:
    return _LEVEL_RECOMMENDATION[risk_level]


def verification_questions(risk_level: RiskLevel) -> list[str]:
    if risk_level is RiskLevel.HIGH:
        return list(_HIGH_RISK_QUESTIONS)
    if risk_level is RiskLevel.MEDIUM:
        return list(_MEDIUM_RISK_QUESTIONS)
    return []


# ✅ Ham moi: Kiem tra blacklist voi STK + Bank (dieu kien KIEN QUYET)
def check_blacklist_signal(db: Session, payee_account: str, payee_bank: str) -> RiskSignal | None:
    """
    Kiem tra STK + Ngan hang trong blacklist.
    Ten trong evidence chi de hien thi, khong dung de match.

    Tra ve RiskSignal neu tim thay, None neu khong.
    """
    if not payee_account or not payee_bank:
        return None

    entry = (
        db.query(Blacklist)
        .filter(
            Blacklist.entity_value == payee_account.replace(" ", "").strip(),
            Blacklist.bank == payee_bank.strip(),
            Blacklist.is_active.is_(True),
            Blacklist.entity_type == "account",
        )
        .first()
    )

    if entry is None:
        return None

    # Lay ten tu evidence de hien thi (co the thay doi, khong dung de match)
    evidence = entry.evidence or {}
    ten = evidence.get("ten", "Khong ro")

    return RiskSignal(
        code="BLACKLISTED_PAYEE",
        label="Nguoi nhan nam trong danh sach den",
        weight=70,
        detail=f"{ten} | {entry.bank} | Risk: {float(entry.risk_score) * 100:.0f}%",
    )
