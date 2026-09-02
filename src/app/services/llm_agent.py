from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from ..models import Blacklist, InterventionLog, ScamPattern, Transaction, TrustedRecipient


class InterventionStep(Enum):
    INITIAL_WARNING = 1  # Cảnh báo ban đầu
    BLACKLIST_DETAILS = 2  # Hiển thị chi tiết blacklist
    PATTERN_EXPLANATION = 3  # Giải thích pattern lừa đảo
    TRUST_CHECK = 4  # Kiểm tra người quen
    FINAL_CONFIRMATION = 5  # Xác nhận cuối cùng


@dataclass
class AgentState:
    transaction_id: str
    current_step: InterventionStep
    risk_factors: list[str] = field(default_factory=list)
    user_responses: list[str] = field(default_factory=list)
    can_proceed: bool = False
    messages: list[dict] = field(default_factory=list)


class InterventionAgent:
    """
    Agent can thiệp đa bước sử dụng LangGraph pattern.
    HITL: Dừng ở mỗi bước, chờ người dùng phản hồi.
    KHÔNG tự động chặn giao dịch — chỉ cung cấp thông tin để user tự quyết định.
    """

    def __init__(self, db: Session):
        self.db = db

    async def process_step(self, transaction_id: str, user_response: str | None = None) -> dict[str, Any]:
        """
        Xử lý 1 bước trong luồng can thiệp.
        Trả về message + actions, chờ user phản hồi bước tiếp theo.
        """
        tx = self.db.query(Transaction).filter(Transaction.id == transaction_id).first()
        if not tx:
            raise ValueError("Giao dịch không tồn tại")

        # Lấy log can thiệp hiện tại
        logs = (
            self.db.query(InterventionLog)
            .filter(InterventionLog.transaction_id == transaction_id)
            .order_by(InterventionLog.step_number)
            .all()
        )

        current_step_num = len(logs) + 1

        # Xác định bước tiếp theo dựa trên context
        next_step = self._determine_next_step(tx, logs, user_response)

        # Tạo message cho bước này
        message_data = self._generate_step_message(tx, next_step, logs)

        # Lưu log
        log = InterventionLog(
            transaction_id=transaction_id,
            step_number=current_step_num,
            agent_message=message_data["message"],
            user_response=user_response,
            risk_factors=message_data.get("risk_factors"),
            suggested_actions=message_data.get("actions"),
        )
        self.db.add(log)
        self.db.commit()

        return {
            "transaction_id": transaction_id,
            "current_step": current_step_num,
            "total_steps": self._estimate_total_steps(tx),
            "message": message_data["message"],
            "actions": message_data["actions"],
            "can_proceed": message_data["can_proceed"],
            "risk_factors": message_data.get("risk_factors", []),
            "requires_decision": message_data.get("requires_decision", True),
        }

    def _determine_next_step(
        self, tx: Transaction, logs: list[InterventionLog], user_response: str | None
    ) -> InterventionStep:
        """Xác định bước tiếp theo dựa trên ngữ cảnh"""
        step_count = len(logs)

        if step_count == 0:
            return InterventionStep.INITIAL_WARNING

        if step_count == 1:
            return InterventionStep.BLACKLIST_DETAILS

        if step_count == 2 and tx.rule_risk_score and float(tx.rule_risk_score) > 0.6:
            return InterventionStep.PATTERN_EXPLANATION

        if step_count <= 3:
            return InterventionStep.TRUST_CHECK

        return InterventionStep.FINAL_CONFIRMATION

    def _generate_step_message(
        self, tx: Transaction, step: InterventionStep, logs: list[InterventionLog]
    ) -> dict[str, Any]:
        """Tạo nội dung message cho từng bước — DỰA TRÊN DỮ LIỆU THỰC"""

        if step == InterventionStep.INITIAL_WARNING:
            return self._step_initial_warning(tx)

        elif step == InterventionStep.BLACKLIST_DETAILS:
            return self._step_blacklist_details(tx)

        elif step == InterventionStep.PATTERN_EXPLANATION:
            return self._step_pattern_explanation(tx)

        elif step == InterventionStep.TRUST_CHECK:
            return self._step_trust_check(tx)

        elif step == InterventionStep.FINAL_CONFIRMATION:
            return self._step_final_confirmation(tx)

        return {
            "message": "Không xác định được bước tiếp theo.",
            "actions": ["Liên hệ hỗ trợ"],
            "can_proceed": False,
            "requires_decision": True,
        }

    def _step_initial_warning(self, tx: Transaction) -> dict:
        """Bước 1: Cảnh báo ban đầu"""
        amount_str = f"{float(tx.amount):,.0f} {tx.currency}"

        message = (
            f"⚠️ **CẢNH BÁO BẢO MẬT** ⚠️\n\n"
            f"Bạn đang chuẩn bị chuyển **{amount_str}** "
            f"đến tài khoản **{tx.recipient_account}** "
            f"(Ngân hàng: {tx.recipient_bank or 'Không xác định'}).\n\n"
            f"Hệ thống phát hiện dấu hiệu rủi ro: **{tx.risk_level.upper()}**\n"
            f"Lý do: {tx.warning_reason}\n\n"
            f"🛡️ Vui lòng xác minh kỹ trước khi chuyển tiền. "
            f"Bạn có muốn tìm hiểu thêm về các dấu hiệu rủi ro không?"
        )

        return {
            "message": message,
            "actions": ["Xem chi tiết rủi ro", "Hủy giao dịch ngay", "Tôi tin tưởng người này"],
            "can_proceed": False,
            "requires_decision": True,
            "risk_factors": [tx.warning_reason] if tx.warning_reason else [],
        }

    def _step_blacklist_details(self, tx: Transaction) -> dict:
        """Bước 2: Chi tiết blacklist matches"""
        # Lấy blacklist matches từ DB (tìm chính xác + chứa substring)
        matches = (
            self.db.query(Blacklist)
            .filter(Blacklist.is_active.is_(True))
            .filter(
                (Blacklist.entity_value == tx.recipient_account)
                | (Blacklist.entity_value.contains(tx.recipient_account))
            )
            .all()
        )

        if not matches:
            return {
                "message": (
                    "✅ **Kiểm tra Danh sách đen**\n\n"
                    f"Tài khoản **{tx.recipient_account}** "
                    f"không nằm trong danh sách đen của hệ thống.\n\n"
                    "Tuy nhiên, điều này không đảm bảo 100% an toàn. "
                    "Hãy tiếp tục kiểm tra các dấu hiệu khác."
                ),
                "actions": ["Kiểm tra pattern lừa đảo", "Quay lại", "Hủy giao dịch"],
                "can_proceed": False,
                "requires_decision": True,
                "risk_factors": [],
            }

        details = []
        risk_factors = []

        for m in matches:
            evidence = m.evidence or {}
            detail = (
                f"🔴 **{m.entity_value}**\n"
                f"   • Loại: {m.entity_type.upper()}\n"
                f"   • Nguồn cảnh báo: {m.source}\n"
                f"   • Điểm rủi ro: {float(m.risk_score) * 100:.0f}%\n"
                f"   • Thông tin: {evidence.get('ten', 'Không rõ')} - "
                f"{evidence.get('ngan_hang', 'Không rõ')}\n"
            )
            details.append(detail)
            risk_factors.append(f"Blacklist: {m.entity_value} ({m.source})")

        message = (
            "🚨 **PHÁT HIỆN TRONG DANH SÁCH ĐEN** 🚨\n\n"
            f"Tài khoản **{tx.recipient_account}** khớp với "
            f"{len(matches)} bản ghi trong hệ thống cảnh báo:\n\n"
            + "\n".join(details)
            + "\n\n⚠️ **Đây là dấu hiệu rất nghiêm trọng.** "
            "Nếu bạn không quen biết chắc chắn người này, "
            "**HÃY HỦY GIAO DỊCH NGAY LẬP TỨC**."
        )

        return {
            "message": message,
            "actions": ["Tôi hiểu rủi ro, vẫn muốn tiếp tục", "Kiểm tra thêm pattern lừa đảo", "Hủy giao dịch ngay"],
            "can_proceed": False,
            "requires_decision": True,
            "risk_factors": risk_factors,
        }

    def _step_pattern_explanation(self, tx: Transaction) -> dict:
        """Bước 3: Giải thích pattern lừa đảo phát hiện được"""
        # Lấy patterns khớp với description
        patterns = []
        if tx.description:
            desc_lower = tx.description.lower()
            all_patterns = self.db.query(ScamPattern).filter(ScamPattern.is_active.is_(True)).all()

            for p in all_patterns:
                if p.keywords and any(kw.lower() in desc_lower for kw in p.keywords):
                    patterns.append(p)

        if not patterns:
            return {
                "message": (
                    "📋 **Phân tích nội dung giao dịch**\n\n"
                    f'Nội dung: "{tx.description or "(Không có)"}"\n\n'
                    "Không phát hiện từ khóa đặc trưng của các kịch bản lừa đảo phổ biến."
                ),
                "actions": ["Kiểm tra người quen", "Quay lại", "Hủy giao dịch"],
                "can_proceed": False,
                "requires_decision": True,
                "risk_factors": [],
            }

        explanations = []
        risk_factors = []

        for p in patterns:
            exp = (
                f"⚠️ **{p.pattern_name}**\n"
                f"   {p.description}\n"
                f"   • Từ khóa phát hiện: {', '.join(p.keywords or [])}\n"
                f"   • Mức độ nghiêm trọng: {float(p.risk_weight) * 100:.0f}%\n"
            )
            explanations.append(exp)
            risk_factors.append(f"Pattern: {p.pattern_name}")

        message = (
            "🕵️ **PHÁT HIỆN KỊCH BẢN LỪA ĐẢO** 🕵️\n\n"
            f'Nội dung giao dịch: "{tx.description}"\n\n'
            "Hệ thống phát hiện các dấu hiệu sau:\n\n"
            + "\n".join(explanations)
            + "\n\n💡 **Lưu ý:** Các từ khóa trên thường xuất hiện trong "
            "kịch bản lừa đảo. Hãy cẩn thận!"
        )

        return {
            "message": message,
            "actions": ["Tôi hiểu, đây là giao dịch hợp lệ", "Kiểm tra người quen biết", "Hủy giao dịch"],
            "can_proceed": False,
            "requires_decision": True,
            "risk_factors": risk_factors,
        }

    def _step_trust_check(self, tx: Transaction) -> dict:
        """Bước 4: Kiểm tra người nhận có trong danh sách tin cậy không"""
        trusted = (
            self.db.query(TrustedRecipient)
            .filter(TrustedRecipient.user_id == tx.user_id, TrustedRecipient.account_number == tx.recipient_account)
            .first()
        )

        # Kiểm tra lịch sử giao dịch với người này
        history_count = (
            self.db.query(Transaction)
            .filter(
                Transaction.user_id == tx.user_id,
                Transaction.recipient_account == tx.recipient_account,
                Transaction.status == "completed",
            )
            .count()
        )

        if trusted:
            message = (
                "✅ **KIỂM TRA NGƯỜI QUEN**\n\n"
                f"Tài khoản **{tx.recipient_account}** "
                f"đã được bạn thêm vào danh sách tin cậy "
                f"với tên: **{trusted.recipient_name}**.\n\n"
                f"Bạn đã từng giao dịch thành công với tài khoản này "
                f"{history_count} lần trước đây.\n\n"
                "Tuy nhiên, hãy đảm bảo tài khoản này "
                "**không bị hack** hoặc **bị giả mạo**."
            )
            risk_factors = ["Người nhận trong danh sách tin cậy"]
        elif history_count > 0:
            message = (
                "⚠️ **KIỂM TRA NGƯỜI QUEN**\n\n"
                f"Bạn đã từng giao dịch với tài khoản **{tx.recipient_account}** "
                f"{history_count} lần trước đây, "
                f"nhưng tài khoản này **chưa được thêm vào danh sách tin cậy**.\n\n"
                "💡 Gợi ý: Nếu đây là người bạn thường xuyên chuyển tiền, "
                "hãy thêm vào danh sách tin cậy để giảm cảnh báo sau này."
            )
            risk_factors = [f"Đã giao dịch {history_count} lần, chưa tin cậy"]
        else:
            message = (
                "🚨 **KIỂM TRA NGƯỜI QUEN**\n\n"
                f"Tài khoản **{tx.recipient_account}** "
                f"**HOÀN TOÀN MỚI** — bạn chưa từng giao dịch với tài khoản này "
                "và tài khoản này **không nằm trong danh sách tin cậy**.\n\n"
                "🔴 **Đây là yếu tố rủi ro cao.** "
                "Nếu ai đó yêu cầu bạn chuyển tiền khẩn cấp qua tài khoản mới, "
                "rất có thể đó là lừa đảo."
            )
            risk_factors = ["Người nhận hoàn toàn mới"]

        return {
            "message": message,
            "actions": [
                "Tôi đã xác minh qua điện thoại/cá nhân",
                "Thêm vào danh sách tin cậy và tiếp tục",
                "Hủy giao dịch",
            ],
            "can_proceed": False,
            "requires_decision": True,
            "risk_factors": risk_factors,
        }

    def _step_final_confirmation(self, tx: Transaction) -> dict:
        """Bước 5: Xác nhận cuối cùng — HITL quyết định"""
        # Tổng hợp tất cả log can thiệp trước đó
        logs = (
            self.db.query(InterventionLog)
            .filter(InterventionLog.transaction_id == tx.id)
            .order_by(InterventionLog.step_number)
            .all()
        )

        all_risk_factors = []
        for log in logs:
            if log.risk_factors:
                if isinstance(log.risk_factors, list):
                    all_risk_factors.extend(str(factor) for factor in log.risk_factors)
                else:
                    all_risk_factors.append(str(log.risk_factors))

        unique_risk_factors = list(dict.fromkeys(all_risk_factors))
        risk_summary = (
            "\n".join(f"• {factor}" for factor in unique_risk_factors)
            if unique_risk_factors
            else "• Không có yếu tố bổ sung nào được ghi nhận."
        )
        amount = f"{float(tx.amount):,.0f} {tx.currency}"

        return {
            "message": (
                "🛡️ **XÁC NHẬN CUỐI CÙNG**\n\n"
                f"Giao dịch **{amount}** tới tài khoản **{tx.recipient_account}** "
                f"được đánh giá ở mức **{str(tx.risk_level).upper()}**.\n\n"
                f"Các yếu tố đã ghi nhận:\n{risk_summary}\n\n"
                "Hãy chỉ tiếp tục khi bạn đã tự xác minh người nhận và hiểu rõ các cảnh báo trên."
            ),
            "actions": ["Tôi đã xác minh và muốn tiếp tục", "Hủy giao dịch"],
            "can_proceed": True,
            "requires_decision": True,
            "risk_factors": unique_risk_factors,
        }
