from pydantic import BaseModel, Field

# ── Chat (schema cũ, giữ lại để không break test hiện có) ──────────────────


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    analysis: str = Field(default="", description="Phân tích nội bộ")


# ── Transaction Analysis ────────────────────────────────────────────────────


class TransactionRequest(BaseModel):
    """Dữ liệu giao dịch cần phân tích."""

    sender: str = Field(..., min_length=1, max_length=200, description="Người gửi")
    receiver: str = Field(..., min_length=1, max_length=200, description="Người nhận")
    receiver_account: str = Field(..., min_length=1, max_length=50, description="Số tài khoản người nhận")
    amount: float = Field(..., gt=0, description="Số tiền giao dịch (VND)")
    description: str = Field(default="", max_length=1000, description="Nội dung chuyển tiền")


class TransactionAnalyzeResponse(BaseModel):
    """Response phân tích giao dịch — chỉ trả dữ liệu cần thiết (data minimization).

    CHÚ Ý: KHÔNG bao gồm toàn bộ object Transaction hoặc receiver_account đầy đủ.
    """

    warning_level: str = Field(..., description="Mức cảnh báo: safe | suspicious | high_risk")
    explanation: str = Field(..., description="Giải thích nguyên nhân cảnh báo")
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Điểm rủi ro từ 0.0 đến 1.0")
    matched_entry_masked: str | None = Field(
        default=None,
        description="Thông tin liên quan (đã mask PDPA, không phải data thô)",
    )
