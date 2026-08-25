from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.core.deps import get_current_user
from src.app.db.session import get_db
from src.app.models.user import User, UserRole

router = APIRouter(prefix="/support", tags=["support"])


class SupportContactOut(BaseModel):
    email: str
    phone: str


@router.get("/contact", response_model=SupportContactOut)
def get_support_contact(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SupportContactOut:
    admin = db.scalar(
        select(User)
        .where(
            User.role == UserRole.ADMIN.value,
            User.is_active.is_(True),
            User.email.is_not(None),
        )
        .order_by(User.created_at.asc())
    )
    if admin is None or not admin.email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chưa cấu hình thông tin liên hệ của admin",
        )
    return SupportContactOut(
        email=admin.email,
        phone=admin.phone or "Chưa cập nhật",
    )
