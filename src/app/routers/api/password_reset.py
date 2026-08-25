"""Forgot password — OTP qua email."""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.db.session import get_db
from src.app.models.user import User
from src.app.services.email_service import send_email

# nếu project hash password khác, import đúng hàm của bạn
from src.app.core.security import hash_password  # chỉnh path nếu khác

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_MINUTES = 10
OTP_LENGTH = 6
# in-memory demo; production nên dùng Redis / bảng DB
_otp_store: dict[str, dict] = {}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8, max_length=128)


class MessageOut(BaseModel):
    message: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def _generate_otp() -> str:
    # 6 chữ số, không leading-zero issue
    return f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"


def _otp_email_html(*, otp: str, full_name: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:18px">Timi</h1>
        <p style="margin:6px 0 0;color:#dbeafe;font-size:12px">Đặt lại mật khẩu</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Xin chào <b>{full_name or "bạn"}</b>,</p>
        <p>Mã OTP đặt lại mật khẩu của bạn là:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;margin:20px 0;color:#1e40af">
          {otp}
        </p>
        <p style="color:#64748b;font-size:13px">
          Mã có hiệu lực <b>{OTP_TTL_MINUTES} phút</b>. Không chia sẻ mã này với bất kỳ ai.
        </p>
        <p style="color:#94a3b8;font-size:12px;margin-top:20px">
          Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
        </p>
      </div>
    </div>
    """


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> MessageOut:
    """Gửi OTP về email nếu tài khoản tồn tại. Luôn trả message giống nhau."""
    email = _normalize_email(str(payload.email))
    generic = MessageOut(
        message="Nếu email tồn tại trong hệ thống, mã OTP đã được gửi. Kiểm tra hộp thư (và Spam)."
    )

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        # Không tiết lộ email có tồn tại
        logger.info("forgot-password: email not found %s", email)
        return generic

    # Rate limit đơn giản: 1 request / 60s
    if user.google_subject:
        return generic

    existing = _otp_store.get(email)
    if existing:
        created = existing.get("created_at")
        if created and datetime.now(timezone.utc) - created < timedelta(seconds=60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Vui lòng đợi khoảng 1 phút trước khi gửi lại OTP.",
            )

    otp = _generate_otp()
    _otp_store[email] = {
        "otp_hash": _hash_otp(otp),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
        "created_at": datetime.now(timezone.utc),
        "attempts": 0,
    }

    full_name = getattr(user, "full_name", None) or "bạn"
    sent = send_email(
        to=email,
        subject="[Timi] Mã OTP đặt lại mật khẩu",
        html=_otp_email_html(otp=otp, full_name=full_name),
    )
    if not sent:
        logger.error("forgot-password: failed to send email to %s", email)
        # Vẫn trả generic; log để admin biết mail lỗi
        # (demo: có thể log OTP khi EMAIL_ENABLED=false)
        if os.getenv("APP_ENV", "development") == "development":
            logger.warning("DEV OTP for %s = %s", email, otp)

    return generic


@router.post("/reset-password", response_model=MessageOut)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageOut:
    email = _normalize_email(str(payload.email))
    otp = payload.otp.strip()
    new_password = payload.new_password

    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự.",
        )

    record = _otp_store.get(email)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.",
        )

    if datetime.now(timezone.utc) > record["expires_at"]:
        _otp_store.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP đã hết hạn. Hãy yêu cầu mã mới.",
        )

    record["attempts"] = int(record.get("attempts") or 0) + 1
    if record["attempts"] > 5:
        _otp_store.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nhập sai OTP quá nhiều lần. Hãy yêu cầu mã mới.",
        )

    if _hash_otp(otp) != record["otp_hash"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã OTP không đúng.",
        )

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        _otp_store.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không tìm thấy tài khoản.",
        )

    # Cập nhật mật khẩu — chỉnh field đúng model của bạn
    # Ví dụ: user.hashed_password = hash_password(new_password)
    if user.google_subject:
        _otp_store.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google-only accounts do not use a local password.",
        )

    if hasattr(user, "hashed_password"):
        user.hashed_password = hash_password(new_password)
    elif hasattr(user, "password_hash"):
        user.password_hash = hash_password(new_password)
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không cập nhật được mật khẩu (field hash không tìm thấy).",
        )

    db.add(user)
    db.commit()
    _otp_store.pop(email, None)
    logger.info("Password reset OK for %s", email)

    return MessageOut(message="Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.")
