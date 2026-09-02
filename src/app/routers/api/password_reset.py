"""Forgot password — OTP qua email."""

from __future__ import annotations

import html
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.core.security import hash_password, validate_password_strength, verify_password
from src.app.db.session import get_db
from src.app.models.password_reset_verification import PasswordResetVerification
from src.app.models.user import User
from src.app.services.audit import add_audit_log
from src.app.services.auth_throttle import clear_failures
from src.app.services.email_service import send_email
from src.app.services.verification_secrets import hash_verification_code, verification_code_matches

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL_MINUTES = 10
OTP_LENGTH = 6


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=8)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class MessageOut(BaseModel):
    message: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_otp(otp: str) -> str:
    return hash_verification_code(otp)


def _generate_otp() -> str:
    # 6 chữ số, không leading-zero issue
    return f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"


def _otp_email_html(*, otp: str, full_name: str) -> str:
    safe_name = html.escape(full_name or "bạn")
    return f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
      <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:18px">Timi</h1>
        <p style="margin:6px 0 0;color:#dbeafe;font-size:12px">Đặt lại mật khẩu</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        <p>Xin chào <b>{safe_name}</b>,</p>
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
    generic = MessageOut(message="Nếu email tồn tại trong hệ thống, mã OTP đã được gửi. Kiểm tra hộp thư (và Spam).")

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        # Không tiết lộ email có tồn tại
        logger.info("forgot-password: request accepted for unknown account")
        return generic

    if user.google_subject:
        return generic

    now = datetime.now(UTC)
    existing = db.scalar(
        select(PasswordResetVerification).where(PasswordResetVerification.email == email).with_for_update()
    )
    if existing and now - existing.created_at < timedelta(seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Vui lòng đợi khoảng 1 phút trước khi gửi lại OTP.",
        )

    otp = _generate_otp()
    if existing is None:
        existing = PasswordResetVerification(
            user_id=user.id,
            email=email,
            otp_hash=_hash_otp(otp),
            expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
            created_at=now,
            attempts=0,
        )
        db.add(existing)
    else:
        existing.user_id = user.id
        existing.otp_hash = _hash_otp(otp)
        existing.expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
        existing.created_at = now
        existing.attempts = 0
    db.commit()

    full_name = getattr(user, "full_name", None) or "bạn"
    sent = send_email(
        to=email,
        subject="[Timi] Mã OTP đặt lại mật khẩu",
        html=_otp_email_html(otp=otp, full_name=full_name),
    )
    if not sent:
        # Never print reset secrets. Remove the unusable challenge so the user
        # can retry immediately after mail delivery is restored.
        logger.error("forgot-password: email delivery failed")
        failed = db.scalar(select(PasswordResetVerification).where(PasswordResetVerification.email == email))
        if failed is not None:
            db.delete(failed)
            db.commit()

    return generic


@router.post("/reset-password", response_model=MessageOut)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageOut:
    email = _normalize_email(str(payload.email))
    otp = payload.otp.strip()
    record = db.scalar(
        select(PasswordResetVerification).where(PasswordResetVerification.email == email).with_for_update()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.",
        )

    if datetime.now(UTC) > record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP đã hết hạn. Hãy yêu cầu mã mới.",
        )

    if not verification_code_matches(otp, record.otp_hash):
        record.attempts += 1
        if record.attempts >= 5:
            db.delete(record)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nhập sai OTP quá nhiều lần. Hãy yêu cầu mã mới.",
            )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã OTP không đúng.",
        )

    user = db.scalar(select(User).where(User.id == record.user_id).with_for_update())
    if not user:
        db.delete(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không tìm thấy tài khoản.",
        )

    # Cập nhật mật khẩu — chỉnh field đúng model của bạn
    # Ví dụ: user.hashed_password = hash_password(new_password)
    if user.google_subject:
        db.delete(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Google-only accounts do not use a local password.",
        )

    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải khác mật khẩu hiện tại.",
        )

    user.hashed_password = hash_password(payload.new_password)
    user.auth_token_version += 1
    user.last_login_device_hash = None
    user.trusted_device_until = None
    clear_failures(user, "login")
    db.delete(record)
    add_audit_log(
        db,
        action="auth.password_reset",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"sessions_revoked": True},
    )
    db.commit()
    logger.info("Password reset completed")

    return MessageOut(message="Đặt lại mật khẩu thành công. Bạn có thể đăng nhập.")
