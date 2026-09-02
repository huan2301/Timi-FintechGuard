from dataclasses import dataclass
from decimal import Decimal

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Blacklist, ScamPattern, Transaction, TrustedRecipient


@dataclass
class RiskResult:
    ml_score: float | None
    rule_score: float
    final_score: float
    level: str  # low/medium/high/critical
    reason: str
    matched_blacklist: list[dict]
    matched_patterns: list[dict]


class RiskEngine:
    """
    Engine tinh diem rui ro ket hop:
    1. Blacklist matching (Rule-based) — STK + Ngan hang = dieu kien KIEN QUYET
    2. Pattern matching (Keywords + Regex)
    3. ML Scoring (Heuristic + Statistical)
    4. Trusted recipient check
    """

    # Nguong rui ro
    THRESHOLDS = {"low": 0.30, "medium": 0.50, "high": 0.75, "critical": 0.90}

    # Trong so
    WEIGHTS = {"blacklist": 0.40, "pattern": 0.30, "ml": 0.20, "behavior": 0.10}

    def __init__(self, db: Session):
        self.db = db

    async def calculate_risk(
        self, user_id: str, recipient_account: str, recipient_bank: str | None, amount: Decimal, description: str | None
    ) -> RiskResult:
        """
        Tinh toan diem rui ro tong hop.
        KHONG dung LLM de bia du lieu — chi dung du lieu thuc tu DB.
        """

        # 1. Kiem tra Blacklist (tu file Excel + admin input)
        # ✅ STK + Ngan hang = dieu kien KIEN QUYET
        blacklist_matches = self._check_blacklist(recipient_account, recipient_bank)
        blacklist_score = self._calculate_blacklist_score(blacklist_matches)

        # 2. Pattern matching (scam keywords, regex)
        pattern_matches = self._check_patterns(description, recipient_account)
        pattern_score = self._calculate_pattern_score(pattern_matches)

        # 3. ML Heuristic (statistical analysis)
        ml_score = self._ml_heuristic_analysis(
            user_id=user_id, amount=amount, recipient_account=recipient_account, description=description
        )

        # 4. Behavioral analysis (lich su giao dich user)
        behavior_score = self._behavioral_analysis(user_id, amount, recipient_account)

        # 5. Kiem tra trusted recipient (giam rui ro neu da tin cay)
        trust_factor = self._check_trusted_recipient(user_id, recipient_account, recipient_bank)

        # Tinh diem tong hop co trong so
        raw_score = (
            blacklist_score * self.WEIGHTS["blacklist"]
            + pattern_score * self.WEIGHTS["pattern"]
            + (ml_score or 0) * self.WEIGHTS["ml"]
            + behavior_score * self.WEIGHTS["behavior"]
        )

        # Ap dung trust factor (giam rui ro neu nguoi nhan tin cay)
        final_score = max(0.0, raw_score * (1 - trust_factor))

        # Xac dinh muc do
        level = self._determine_level(final_score)

        # Tao ly do canh bao (co can cu, khong bia)
        reason = self._generate_reason(
            level, blacklist_matches, pattern_matches, ml_score, behavior_score, trust_factor
        )

        return RiskResult(
            ml_score=round(ml_score, 3) if ml_score else None,
            rule_score=round(max(blacklist_score, pattern_score), 3),
            final_score=round(final_score, 3),
            level=level,
            reason=reason,
            matched_blacklist=[
                {
                    "entity": m.entity_value,
                    "type": m.entity_type,
                    "bank": m.bank,  # ✅ Them bank vao response
                    "source": m.source,
                    "risk": float(m.risk_score),
                    "evidence": m.evidence,
                }
                for m in blacklist_matches
            ],
            matched_patterns=[
                {"name": p.pattern_name, "description": p.description, "weight": float(p.risk_weight)}
                for p in pattern_matches
            ],
        )

    def _check_blacklist(self, account: str, bank: str | None) -> list[Blacklist]:
        """
        ✅ Kiem tra STK + Ngan hang la dieu kien KIEN QUYET.
        Ten co the thay doi, KHONG dung de match.

        Tra ve: List[Blacklist] neu tim thay, [] neu khong.
        """
        # ❌ Khong co STK hoac khong co bank -> khong check duoc
        if not account or not bank:
            return []

        account_clean = str(account).replace(" ", "").strip()
        bank_clean = str(bank).strip()

        # ✅ Dieu kien KIEN QUYET: STK chinh xac + Ngan hang chinh xac
        matches = (
            self.db.query(Blacklist)
            .filter(
                Blacklist.is_active.is_(True),
                Blacklist.entity_type == "account",
                Blacklist.entity_value == account_clean,  # Match chinh xac STK
                Blacklist.bank == bank_clean,  # ✅ Match chinh xac ngân hàng (cot rieng)
            )
            .all()
        )

        return matches

    def _calculate_blacklist_score(self, matches: list[Blacklist]) -> float:
        """Tinh diem rui ro tu blacklist matches"""
        if not matches:
            return 0.0

        # Lay diem cao nhat tu cac match
        max_score = max(float(m.risk_score) for m in matches)

        # Neu match nhieu nguon -> tang diem
        source_count = len(set(m.source for m in matches))
        multiplier = 1.0 + (source_count - 1) * 0.1

        return min(1.0, max_score * multiplier)

    def _check_patterns(self, description: str | None, account: str) -> list[ScamPattern]:
        """Kiem tra mo ta giao dich khop voi pattern lua dao nao"""
        if not description:
            return []

        desc_lower = description.lower()
        patterns = self.db.query(ScamPattern).filter(ScamPattern.is_active.is_(True)).all()

        matched = []
        for pattern in patterns:
            # Kiem tra keywords
            if pattern.keywords:
                if any(kw.lower() in desc_lower for kw in pattern.keywords):
                    matched.append(pattern)
                    continue

            # Kiem tra regex patterns neu co
            # (co the mo rong them)

        return matched

    def _calculate_pattern_score(self, matches: list[ScamPattern]) -> float:
        """Tinh diem tu pattern matches"""
        if not matches:
            return 0.0

        total_weight = sum(float(p.risk_weight) for p in matches)
        return min(1.0, total_weight)

    def _ml_heuristic_analysis(
        self, user_id: str, amount: Decimal, recipient_account: str, description: str | None
    ) -> float | None:
        """
        Phan tich heuristic dua tren du lieu lich su.
        Khong dung LLM — dung thong ke va rule.
        """
        # Lay lich su giao dich cua user
        history = (
            self.db.query(Transaction)
            .filter(Transaction.user_id == user_id, Transaction.status == "completed")
            .order_by(Transaction.created_at.desc())
            .limit(50)
            .all()
        )

        if not history:
            # User moi -> rui ro trung binh
            return 0.40

        scores = []

        # 1. Anomaly detection: so tien bat thuong
        amounts = [float(h.amount) for h in history]
        avg_amount = np.mean(amounts)
        std_amount = np.std(amounts) if len(amounts) > 1 else avg_amount * 0.5

        current_amount = float(amount)
        if std_amount > 0:
            z_score = abs(current_amount - avg_amount) / std_amount
            if z_score > 3:
                scores.append(0.80)  # Bat thuong cao
            elif z_score > 2:
                scores.append(0.50)
            else:
                scores.append(0.10)
        else:
            scores.append(0.10)

        # 2. Frequency: nguoi nhan moi
        known_recipients = set(h.recipient_account for h in history)
        if recipient_account not in known_recipients:
            scores.append(0.60)  # Nguoi nhan moi = rui ro cao hon
        else:
            scores.append(0.05)

        # 3. Time-based: giao dich dem khuya (neu co timestamp)
        # (Co the mo rong)

        # 4. Description analysis: cac tu khoa nguy hiem
        danger_keywords = ["khan cap", "nhanh", "gap", "bi mat", "khong duoc noi", "thuong", "trung thuong"]
        if description:
            desc_lower = description.lower()
            danger_count = sum(1 for kw in danger_keywords if kw in desc_lower)
            scores.append(min(0.90, danger_count * 0.25))
        else:
            scores.append(0.0)

        return round(np.mean(scores), 3) if scores else 0.30

    def _behavioral_analysis(self, user_id: str, amount: Decimal, recipient_account: str) -> float:
        """Phan tich hanh vi nguoi dung"""
        # Dem so giao dich bi huy/canh bao gan day
        recent_flagged = (
            self.db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.created_at >= func.now() - func.interval("7 days"),
                Transaction.risk_level.in_(["high", "critical"]),
            )
            .count()
        )

        if recent_flagged >= 3:
            return 0.70  # User co nhieu giao dich rui ro gan day
        elif recent_flagged >= 1:
            return 0.30

        return 0.05

    def _check_trusted_recipient(self, user_id: str, account: str, bank: str | None) -> float:
        """Kiem tra nguoi nhan co trong danh sach tin cay khong"""
        query = self.db.query(TrustedRecipient).filter(
            TrustedRecipient.user_id == user_id, TrustedRecipient.account_number == account
        )

        if bank:
            query = query.filter(TrustedRecipient.bank_code == bank)

        trusted = query.first()

        if trusted:
            return 0.50  # Giam 50% rui ro neu tin cay

        return 0.0

    def _determine_level(self, score: float) -> str:
        """Xac dinh muc do rui ro"""
        if score >= self.THRESHOLDS["critical"]:
            return "critical"
        elif score >= self.THRESHOLDS["high"]:
            return "high"
        elif score >= self.THRESHOLDS["medium"]:
            return "medium"
        else:
            return "low"

    def _generate_reason(
        self,
        level: str,
        blacklist_matches: list[Blacklist],
        pattern_matches: list[ScamPattern],
        ml_score: float | None,
        behavior_score: float,
        trust_factor: float,
    ) -> str:
        """
        Tao ly do canh bao DUA TREN DU LIEU THUC.
        Khong dung LLM de bia — chi liet ke facts.
        """
        reasons = []

        if blacklist_matches:
            # ✅ Hien thi STK + Ngan hang + Ten (ten chi de tham khao)
            for m in blacklist_matches[:3]:
                evidence = m.evidence or {}
                ten = evidence.get("ten", "Khong ro")
                reasons.append(
                    f"Blacklist: {m.entity_value} | {m.bank} | {ten} (risk: {float(m.risk_score) * 100:.0f}%)"
                )

        if pattern_matches:
            patterns = [p.pattern_name for p in pattern_matches[:3]]
            reasons.append(f"Pattern lua dao: {', '.join(patterns)}")

        if ml_score and ml_score > 0.5:
            reasons.append(f"Phan tich ML phat hien bat thuong (score: {ml_score})")

        if behavior_score > 0.3:
            reasons.append("Lich su giao dich gan day co nhieu canh bao")

        if trust_factor > 0:
            reasons.append("Nguoi nhan nam trong danh sach tin cay (da giam rui ro)")

        if not reasons:
            return "Khong phat hien yeu to rui ro dang ke."

        return " | ".join(reasons)
