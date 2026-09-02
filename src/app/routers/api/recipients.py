"""Authenticated recipient lookup API."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.app.core.deps import get_current_user
from src.app.core.security import create_recipient_lookup_token
from src.app.db.session import get_db
from src.app.models.user import User
from src.app.schemas.recipient import RecipientLookupRequest, RecipientLookupResponse
from src.app.services.bank_normalization import normalize_bank_name
from src.app.services.recipient_lookup import RecipientLookupInvalid, RecipientLookupNotFound, lookup_recipient
from src.app.services.timi_bank import TIMI_BANK_CODE

router = APIRouter(prefix="/recipients", tags=["recipients"])


@router.post("/resolve", response_model=RecipientLookupResponse)
def resolve_recipient(
    payload: RecipientLookupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RecipientLookupResponse:
    """Return an internal account name and a short-lived proof for /assess."""
    bank_code = normalize_bank_name(payload.bank_code)
    if bank_code is None:
        raise HTTPException(status_code=422, detail="Ngân hàng không hợp lệ")
    if bank_code != TIMI_BANK_CODE:
        raise HTTPException(
            status_code=503,
            detail="Tra cứu và chuyển liên ngân hàng chưa khả dụng vì chưa tích hợp cổng quyết toán thật.",
        )
    if bank_code == TIMI_BANK_CODE and len(payload.account_number) != 10:
        raise HTTPException(status_code=422, detail="Số tài khoản Timi Bank phải gồm đúng 10 chữ số")
    try:
        result = lookup_recipient(
            db,
            user_id=current_user.id,
            account_number=payload.account_number,
            bank_code=bank_code,
        )
    except RecipientLookupInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RecipientLookupNotFound:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy tên tài khoản trong dữ liệu nội bộ.",
        ) from None

    return RecipientLookupResponse(
        account_number=payload.account_number,
        bank_code=bank_code,
        account_name=result.account_name,
        source=result.source,
        risk_status="caution" if result.needs_caution else "clear",
        risk_message=("Người nhận có dấu hiệu rủi ro" if result.needs_caution else None),
        verification_token=create_recipient_lookup_token(
            user_id=str(current_user.id),
            account_number=payload.account_number,
            bank_code=bank_code,
            account_name=result.account_name,
        ),
    )
