"""Small compatibility endpoints for clients from the first API contract.

The production routes are under ``/assistant`` and ``/agents``. These aliases
keep old smoke clients useful while making the migration explicit and bounded.
"""

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["legacy-compat"])


class LegacyChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class LegacyAnalyzeRequest(BaseModel):
    sender: str = Field(..., min_length=1, max_length=255)
    receiver: str = Field(..., min_length=1, max_length=255)
    receiver_account: str = Field(..., min_length=1, max_length=64)
    amount: float = Field(..., gt=0)
    description: str | None = Field(default=None, max_length=500)


@router.post("/chat", status_code=status.HTTP_200_OK)
def legacy_chat(payload: LegacyChatRequest) -> dict[str, str]:
    """Return a migration hint without invoking an LLM or persisting data."""
    return {
        "message": "Endpoint legacy; hãy dùng POST /api/v1/assistant/chat.",
        "received": payload.message,
    }


@router.get("/status")
def legacy_status() -> dict[str, str]:
    """Compatibility health response for the original starter client."""
    return {"status": "ok", "service": "timi-api"}


@router.post("/transactions/analyze", status_code=status.HTTP_200_OK)
def legacy_analyze(_payload: LegacyAnalyzeRequest) -> dict[str, str]:
    """Give old clients a truthful migration response without echoing PII."""
    return {
        "status": "deprecated",
        "message": "Endpoint này không phân tích rủi ro; hãy dùng POST /api/v1/transactions/assess.",
    }
