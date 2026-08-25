from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.db.session import get_db
from src.app.models.newsletter_subscriber import NewsletterSubscriber

router = APIRouter(prefix="/newsletter", tags=["newsletter"])

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class NewsletterSubscribeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class NewsletterSubscribeResponse(BaseModel):
    message: str
    subscribed: bool = True


@router.post("/subscribe", response_model=NewsletterSubscribeResponse)
def subscribe_to_newsletter(
    payload: NewsletterSubscribeRequest,
    db: Session = Depends(get_db),
) -> NewsletterSubscribeResponse:
    email = payload.email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email không hợp lệ.",
        )

    existing = db.scalar(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == email)
    )
    if existing:
        return NewsletterSubscribeResponse(message="Email đã được đăng ký nhận tin.")

    db.add(NewsletterSubscriber(email=email))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return NewsletterSubscribeResponse(message="Email đã được đăng ký nhận tin.")

    return NewsletterSubscribeResponse(message="Đăng ký nhận tin thành công.")
