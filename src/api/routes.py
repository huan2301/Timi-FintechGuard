"""API Routes.

Nguyên tắc error handling (PDPA):
- logger.error() ghi đầy đủ exc_info ở server
- HTTPException.detail trả ra ngoài KHÔNG chứa stack trace / PII
- receiver_account không bao giờ được echo lại trong error message
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.schemas import (
    ChatRequest,
    ChatResponse,
    TransactionAnalyzeResponse,
    TransactionRequest,
)
from src.services.audit import log_action
from src.services.db import get_db
from src.services.pdpa import mask_transaction_metadata

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Chat (route cũ — giữ lại để không break test hiện có) ──────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, req: Request) -> ChatResponse:
    """Chat với AI agent."""
    try:
        agent = req.app.state.agent
        result = await agent.ainvoke({"query": request.message})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
        )
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Agent xử lý quá lâu, vui lòng thử lại.")
    except Exception as e:
        logger.error(f"Agent error (chat): {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="Không thể xử lý yêu cầu lúc này.")


# ── Transaction Analysis ────────────────────────────────────────────────────

@router.post("/transactions/analyze", response_model=TransactionAnalyzeResponse)
async def analyze_transaction(
    request: TransactionRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
) -> TransactionAnalyzeResponse:
    """Phân tích giao dịch qua AI agent.

    Flow: nhận TransactionRequest → truyền vào AgentState → agent xử lý
    → trả TransactionAnalyzeResponse (data minimization, không leak PII).
    """
    try:
        agent = req.app.state.agent

        # Truyền transaction vào state — tên field "transaction" khớp AgentState
        result = await agent.ainvoke({
            "transaction": request.model_dump(),
        })

        # Đảm bảo có đủ fields bắt buộc, dùng default an toàn nếu agent chưa đủ logic
        warning_level = result.get("warning_level", "safe")
        explanation = result.get("explanation", result.get("response", "Không có thông tin phân tích."))
        risk_score = float(result.get("risk_score", 0.0))
        matched_entry_masked = result.get("matched_entry_masked")

        # Audit log — metadata đã mask trước khi ghi
        masked_meta = mask_transaction_metadata(request.model_dump())
        masked_meta["warning_level"] = warning_level
        masked_meta["risk_score"] = risk_score
        await log_action(
            db=db,
            actor_id=getattr(req.state, "user_id", None),
            action="POST /api/v1/transactions/analyze",
            resource_type="transaction",
            ip=req.client.host if req.client else None,
            metadata=masked_meta,
        )

        return TransactionAnalyzeResponse(
            warning_level=warning_level,
            explanation=explanation,
            risk_score=max(0.0, min(1.0, risk_score)),
            matched_entry_masked=matched_entry_masked,
        )

    except HTTPException:
        raise
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Agent xử lý quá lâu, vui lòng thử lại.")
    except Exception as e:
        logger.error(f"Agent error (analyze): {e}", exc_info=True)
        # PDPA: KHÔNG echo receiver_account hay tên người nhận trong detail
        raise HTTPException(status_code=503, detail="Không thể phân tích giao dịch lúc này.")


# ── Status ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def agent_status():
    """Kiểm tra trạng thái agent."""
    return {"status": "ready", "agent": "LangGraph Agent v1.0"}
