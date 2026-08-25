"""Authenticated blacklist checks for URLs decoded from QR codes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.app.core.deps import get_current_user
from src.app.db.session import get_db
from src.app.services.url_blacklist import find_active_url_blacklist_match

router = APIRouter(prefix="/url-safety", tags=["url-safety"])


class UrlSafetyCheckRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=4_096)


class UrlSafetyCheckResponse(BaseModel):
    blocked: bool
    hostname: str | None
    reason: str | None = None


@router.post("/check", response_model=UrlSafetyCheckResponse)
def check_scanned_url(
    payload: UrlSafetyCheckRequest,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
) -> UrlSafetyCheckResponse:
    """Check a scanned web URL without exposing the complete blacklist."""
    hostname, entry = find_active_url_blacklist_match(db, payload.url)
    if entry is None:
        return UrlSafetyCheckResponse(blocked=False, hostname=hostname)
    return UrlSafetyCheckResponse(
        blocked=True,
        hostname=hostname,
        reason="Tên miền này nằm trong blacklist URL lừa đảo.",
    )
