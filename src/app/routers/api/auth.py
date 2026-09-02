"""Authentication, independent face enrollment, and account profile APIs."""

import base64
import hashlib
import html
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import cloudinary
import cloudinary.uploader
from cryptography.fernet import Fernet, InvalidToken
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.core.deps import PendingLogin, get_current_user, get_pending_login
from src.app.core.policies import (
    DEVICE_LOGIN_CHALLENGE_TTL,
    DEVICE_LOGIN_MAX_ATTEMPTS,
    DEVICE_LOGIN_RESEND_COOLDOWN,
    TRUSTED_LOGIN_DEVICE_TTL,
)
from src.app.core.security import (
    JWTError,
    create_access_token,
    create_card_action_token,
    create_device_login_verification_token,
    create_face_verification_token,
    create_google_phone_completion_token,
    create_login_location_token,
    decode_card_action_token,
    decode_device_login_verification_token,
    decode_google_phone_completion_token,
    hash_password,
    verify_password,
)
from src.app.db.session import get_db
from src.app.models.device_login_verification import DeviceLoginVerification
from src.app.models.email_change_verification import EmailChangeVerification
from src.app.models.face_enrollment import FaceEnrollment
from src.app.models.face_verification_log import FaceVerificationLog
from src.app.models.face_verification_state import FaceVerificationState
from src.app.models.registration_verification import RegistrationVerification
from src.app.models.transaction import Transaction
from src.app.models.user import User, UserRole
from src.app.models.user_card import UserCard
from src.app.schemas.auth import (
    AccountOverview,
    DeviceLoginOtpRequest,
    DeviceLoginResendRequest,
    DeviceVerificationRequiredResponse,
    EmailChangeRequest,
    EmailChangeVerifyRequest,
    FaceEnrollmentRequest,
    FaceVerificationRequest,
    FaceVerificationResponse,
    GoogleLoginRequest,
    GooglePhoneCompletionRequest,
    GooglePhoneCompletionResponse,
    LoginLocationRequest,
    LoginLocationResponse,
    LoginRequest,
    PasswordChangeRequest,
    RegisterAvailabilityRequest,
    RegisterOtpRequest,
    RegisterRequest,
    SecurityCheck,
    TokenResponse,
    TransactionPinRequest,
    UserCardCreate,
    UserCardDetail,
    UserCardPinRequest,
    UserCardSummary,
)
from src.app.schemas.user import UserOut
from src.app.services import risk_rules
from src.app.services.audit import add_audit_log
from src.app.services.auth_throttle import clear_failures, lock_remaining_seconds, record_failure
from src.app.services.email_service import send_email
from src.app.services.face_verification import (
    aggregate_embeddings,
    embedding_from_data_url,
    face_pose_from_data_url,
    face_quality_rule_from_data_url,
    similarity_from_embeddings,
    validate_multiframe_liveness,
)
from src.app.services.notifications import add_in_app_notification
from src.app.services.transaction_telemetry import (
    build_risk_telemetry,
    device_hash_from_id,
    persist_risk_telemetry,
)
from src.app.services.verification_secrets import hash_verification_code, verification_code_matches

router = APIRouter(prefix="/auth", tags=["auth"])
_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_IMAGE_SIZE = 5 * 1024 * 1024
_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
_GOOGLE_CERT_CACHE_DEFAULT_TTL_SECONDS = 300
_GOOGLE_CERT_CACHE_MAX_TTL_SECONDS = 3_600
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def _card_cipher() -> Fernet:
    settings = get_settings()
    secret = settings.card_encryption_key or settings.jwt_secret_key
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def _legacy_card_cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().jwt_secret_key.encode()).digest())
    return Fernet(key)


def _decrypt_card_value(value: str) -> str:
    ciphers = [_card_cipher()]
    if get_settings().card_encryption_key:
        ciphers.append(_legacy_card_cipher())
    for cipher in ciphers:
        try:
            return cipher.decrypt(value.encode()).decode()
        except InvalidToken:
            continue
    raise InvalidToken


def _card_cvv(card: UserCard) -> str:
    if not card.cvv_encrypted:
        return ""
    return _decrypt_card_value(card.cvv_encrypted)


def _card_summary(card: UserCard) -> dict[str, Any]:
    number = _decrypt_card_value(card.card_number_encrypted)
    return {
        "id": card.id,
        "nickname": card.nickname,
        "masked_number": f"•••• •••• •••• {number[-4:]}",
        "holder_name": card.holder_name,
        "expiry_month": card.expiry_month,
        "expiry_year": card.expiry_year,
        "brand": card.brand,
    }


@dataclass(frozen=True, slots=True)
class _CachedGoogleCertificateResponse:
    """Small immutable response surface required by google-auth's verifier."""

    status: int
    data: bytes
    headers: dict[str, str]


_google_cert_cache_lock = threading.Lock()
_google_cert_cache: tuple[float, _CachedGoogleCertificateResponse] | None = None


def _google_cert_cache_ttl(headers: dict[str, str]) -> int:
    """Respect Google's cache header while keeping a conservative upper bound."""
    cache_control = headers.get("cache-control", "")
    for directive in cache_control.split(","):
        key, separator, value = directive.strip().partition("=")
        if key.lower() != "max-age" or not separator:
            continue
        try:
            return min(max(int(value.strip().strip('"')), 60), _GOOGLE_CERT_CACHE_MAX_TTL_SECONDS)
        except ValueError:
            break
    return _GOOGLE_CERT_CACHE_DEFAULT_TTL_SECONDS


def _cached_google_certificate_response(
    fetch: Any,
    *,
    force_refresh: bool = False,
) -> tuple[_CachedGoogleCertificateResponse | Any, bool]:
    """Cache Google's public signing certificates, never an ID token itself."""
    global _google_cert_cache
    now = time.monotonic()
    with _google_cert_cache_lock:
        cached = _google_cert_cache
        if not force_refresh and cached and cached[0] > now:
            return cached[1], True

        response = fetch()
        if response.status != 200:
            return response, False
        headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
        cached_response = _CachedGoogleCertificateResponse(
            status=response.status,
            data=response.data,
            headers=headers,
        )
        _google_cert_cache = (now + _google_cert_cache_ttl(headers), cached_response)
        return cached_response, False


def _clear_google_certificate_cache() -> None:
    """Force a refresh when Google has rotated to an unseen signing key."""
    global _google_cert_cache
    with _google_cert_cache_lock:
        _google_cert_cache = None


class _GoogleCertificateCachingRequest:
    """google-auth transport wrapper which caches only the public cert endpoint."""

    def __init__(self, request: Any, *, force_refresh: bool = False) -> None:
        self._request = request
        self._force_refresh = force_refresh
        self.used_cached_certificate = False

    def __call__(self, url: str, *args: Any, **kwargs: Any) -> Any:
        if url != _GOOGLE_CERTS_URL:
            return self._request(url, *args, **kwargs)
        response, from_cache = _cached_google_certificate_response(
            lambda: self._request(url, *args, **kwargs),
            force_refresh=self._force_refresh,
        )
        self.used_cached_certificate = from_cache
        return response


def _verified_google_identity(credential: str) -> tuple[str, str, str]:
    """Verify Google's ID token and return its immutable ID, email, and name."""
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Đăng nhập Google chưa được cấu hình")

    try:
        from google.auth import exceptions as google_auth_exceptions
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Máy chủ chưa cài đặt hỗ trợ đăng nhập Google",
        ) from exc

    try:
        certificate_request = _GoogleCertificateCachingRequest(google_requests.Request())
        try:
            claims = google_id_token.verify_oauth2_token(
                credential,
                certificate_request,
                settings.google_oauth_client_id,
            )
        except (ValueError, google_auth_exceptions.GoogleAuthError):
            # A cached certificate set may very rarely miss a newly rotated
            # Google key. Refresh once before treating the credential as bad.
            if not certificate_request.used_cached_certificate:
                raise
            _clear_google_certificate_cache()
            claims = google_id_token.verify_oauth2_token(
                credential,
                _GoogleCertificateCachingRequest(
                    google_requests.Request(),
                    force_refresh=True,
                ),
                settings.google_oauth_client_id,
            )
    except (ValueError, google_auth_exceptions.GoogleAuthError) as exc:
        raise HTTPException(status_code=401, detail="Xác thực Google không hợp lệ hoặc đã hết hạn") from exc

    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Nhà phát hành xác thực Google không hợp lệ")

    google_subject = claims.get("sub")
    if not isinstance(google_subject, str) or not google_subject.strip() or len(google_subject) > 255:
        raise HTTPException(status_code=401, detail="Google không trả về mã định danh tài khoản hợp lệ")
    if claims.get("email_verified") is not True:
        raise HTTPException(status_code=401, detail="Email Google chưa được xác minh")

    try:
        email = validate_email(str(claims.get("email") or ""), check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise HTTPException(status_code=401, detail="Google không trả về email hợp lệ") from exc

    full_name = str(claims.get("name") or "").strip()
    if not full_name or len(full_name) > 255:
        raise HTTPException(status_code=401, detail="Google không trả về tên hiển thị hợp lệ")
    return google_subject, email, full_name


def _token_response_for(
    user: User,
    *,
    remember_me: bool = False,
    require_location: bool = False,
    device_hash: str | None = None,
) -> TokenResponse:
    if require_location:
        if device_hash is None:
            raise ValueError("A device-bound location token requires a device hash")
        return TokenResponse(
            access_token=create_login_location_token(
                user_id=str(user.id),
                role=user.role,
                token_version=user.auth_token_version,
                remember_me=remember_me,
                device_hash=device_hash,
            ),
            user=UserOut.model_validate(user),
            location_confirmation_required=True,
        )
    return TokenResponse(
        access_token=create_access_token(
            subject=str(user.id),
            role=user.role,
            expires_delta=(timedelta(days=get_settings().remember_me_expire_days) if remember_me else None),
            token_version=user.auth_token_version,
        ),
        user=UserOut.model_validate(user),
    )


def _locked_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không khả dụng")
    return user


def _verify_transaction_pin(db: Session, user: User, pin: str) -> None:
    """Verify a PIN and persist failure/lockout state before returning."""
    settings = get_settings()
    remaining = lock_remaining_seconds(user, "pin")
    if remaining:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(remaining)},
            detail=f"Mã PIN đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
        )
    if not user.transaction_pin_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bạn chưa cài đặt mã PIN giao dịch",
        )
    if not verify_password(pin, user.transaction_pin_hash):
        locked_for = record_failure(
            user,
            "pin",
            failure_limit=settings.pin_failure_limit,
            lock_seconds=settings.pin_lock_seconds,
        )
        db.commit()
        if locked_for:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(locked_for)},
                detail=f"Nhập sai PIN quá nhiều lần. PIN tạm khóa {locked_for} giây.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mã PIN không đúng")
    clear_failures(user, "pin")
    db.flush()


def _face_state_for_update(db: Session, user_id) -> FaceVerificationState:
    """Lock shared Face ID state so lockout applies across all workers."""
    state = db.scalar(select(FaceVerificationState).where(FaceVerificationState.user_id == user_id).with_for_update())
    if state is None:
        # Migrations seed this row for existing users; this fallback covers
        # isolated test databases and users created before the migration.
        state = FaceVerificationState(user_id=user_id)
        db.add(state)
        db.flush()
    return state


def _face_lock_remaining(state: FaceVerificationState) -> int:
    if state.locked_until is None:
        return 0
    remaining = int((state.locked_until - datetime.now(UTC)).total_seconds())
    if remaining <= 0:
        state.failure_count = 0
        state.locked_until = None
        return 0
    return remaining


def _register_face_failure(
    state: FaceVerificationState,
    *,
    failure_limit: int,
    lock_seconds: int,
) -> tuple[int, int]:
    """Record one failed biometric attempt in the shared database state."""
    state.failure_count += 1
    if state.failure_count >= failure_limit:
        state.locked_until = datetime.now(UTC) + timedelta(seconds=lock_seconds)
    return state.failure_count, _face_lock_remaining(state)


def _configure_cloudinary() -> None:
    settings = get_settings()
    if not all((settings.cloudinary_cloud_name, settings.cloudinary_api_key, settings.cloudinary_api_secret)):
        raise HTTPException(status_code=503, detail="Cloudinary chưa được cấu hình")
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


def _data_url_bytes(value: str) -> bytes:
    try:
        raw = base64.b64decode(value.split(",", 1)[1], validate=True)
    except (IndexError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ") from exc
    if not raw or len(raw) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="Ảnh khuôn mặt phải có dung lượng tối đa 5 MB")
    return raw


def _face_frames(value: str | list[str]) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list) and value and all(isinstance(item, str) for item in value):
        return value
    raise HTTPException(status_code=422, detail="Ảnh khuôn mặt không hợp lệ")


def _record_login_context(
    db: Session,
    *,
    user: User,
    payload: LoginLocationRequest,
    request: Request,
    expected_device_hash: str,
) -> list[str]:
    """Persist mandatory login context and audit only derived risk evidence."""
    peer_ip = request.client.host if request.client is not None else None
    telemetry = build_risk_telemetry(payload.client_context, client_ip=peer_ip)
    if telemetry.device_hash is None or not secrets.compare_digest(telemetry.device_hash, expected_device_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiết bị xác nhận vị trí không khớp với thiết bị đã đăng nhập",
        )
    security_signals = risk_rules.collect_telemetry_signals(db, user.id, telemetry)
    persist_risk_telemetry(
        db,
        user_id=user.id,
        transaction_id=None,
        telemetry=telemetry,
        event_type="login",
    )
    add_audit_log(
        db,
        action="auth.login_succeeded",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={
            "security_signal_types": [signal.signal_type for signal in security_signals],
            "security_signal_count": len(security_signals),
            "coarse_location_required": True,
        },
    )
    return [signal.signal_type for signal in security_signals]


def _registration_otp_email(*, otp: str, full_name: str) -> str:
    safe_name = html.escape(full_name)
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
      <h2 style="color:#2563eb">Timi - Xác minh đăng ký</h2>
      <p>Xin chào <b>{safe_name}</b>,</p>
      <p>Mã xác minh đăng ký tài khoản của bạn là:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;color:#1d4ed8">{otp}</p>
      <p>Mã có hiệu lực trong 10 phút và chỉ được nhập tối đa 5 lần.</p>
      <p style="color:#64748b;font-size:12px">Nếu bạn không thực hiện đăng ký, hãy bỏ qua email này.</p>
    </div>
    """


def _device_login_otp_email(
    *,
    otp: str,
    full_name: str,
    expire_minutes: int,
    attempt_limit: int,
) -> str:
    safe_name = html.escape(full_name)
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
      <h2 style="color:#2563eb">Timi - Xác minh thiết bị đăng nhập</h2>
      <p>Xin chào <b>{safe_name}</b>,</p>
      <p>Một thiết bị mới vừa đăng nhập đúng mật khẩu tài khoản của bạn. Mã xác minh là:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;color:#1d4ed8">{otp}</p>
      <p>Mã có hiệu lực trong {expire_minutes} phút và chỉ được nhập tối đa {attempt_limit} lần.</p>
      <p style="color:#b91c1c;font-weight:600">Không cung cấp mã này cho bất kỳ ai.</p>
      <p style="color:#64748b;font-size:12px">Nếu đây không phải bạn, hãy đổi mật khẩu ngay trên thiết bị đang dùng.</p>
    </div>
    """


def _login_response_for_device(
    db: Session,
    *,
    user: User,
    device_hash: str,
    remember_me: bool,
) -> TokenResponse | DeviceVerificationRequiredResponse:
    """Continue a trusted browser or stage a durable OTP for a different one."""
    now = datetime.now(UTC)
    trusted_until = user.trusted_device_until
    if trusted_until is not None and trusted_until.tzinfo is None:
        # SQLite drops timezone metadata in isolated/local databases.
        trusted_until = trusted_until.replace(tzinfo=UTC)
    is_known_device = bool(
        user.last_login_device_hash and secrets.compare_digest(user.last_login_device_hash, device_hash)
    )
    if is_known_device:
        db.commit()
        db.refresh(user)
        return _token_response_for(
            user,
            remember_me=remember_me,
            require_location=trusted_until is None or now >= trusted_until,
            device_hash=device_hash if trusted_until is None or now >= trusted_until else None,
        )

    record = db.scalar(
        select(DeviceLoginVerification).where(DeviceLoginVerification.user_id == user.id).with_for_update()
    )
    if (
        record is not None
        and record.token_version == user.auth_token_version
        and secrets.compare_digest(record.device_hash, device_hash)
        and now < record.expires_at
        and now - record.created_at < DEVICE_LOGIN_RESEND_COOLDOWN
    ):
        db.commit()
        return DeviceVerificationRequiredResponse(
            verification_token=create_device_login_verification_token(
                user_id=str(user.id),
                verification_id=str(record.id),
                token_version=record.token_version,
            ),
            email=user.email,
            expires_in_seconds=max(1, int((record.expires_at - now).total_seconds())),
            resend_available_in_seconds=max(
                1,
                int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds()) - int((now - record.created_at).total_seconds()),
            ),
            message="Mã xác minh đã được gửi về email của bạn.",
        )
    if (
        record is not None
        and record.token_version == user.auth_token_version
        and now - record.created_at < DEVICE_LOGIN_RESEND_COOLDOWN
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={
                "Retry-After": str(
                    max(
                        1,
                        int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds())
                        - int((now - record.created_at).total_seconds()),
                    )
                )
            },
            detail="Một thiết bị khác vừa yêu cầu mã. Vui lòng đợi trước khi gửi mã mới.",
        )

    otp = f"{secrets.randbelow(1_000_000):06d}"
    record = record or DeviceLoginVerification(user_id=user.id)
    record.device_hash = device_hash
    record.otp_hash = hash_verification_code(otp)
    record.token_version = user.auth_token_version
    record.remember_me = remember_me
    record.expires_at = now + DEVICE_LOGIN_CHALLENGE_TTL
    record.created_at = now
    record.attempts = 0
    db.add(record)
    db.flush()
    add_audit_log(
        db,
        action="auth.device_verification_requested",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"new_device": True},
    )
    if not send_email(
        to=user.email,
        subject="[Timi] Mã xác minh thiết bị đăng nhập mới",
        html=_device_login_otp_email(
            otp=otp,
            full_name=user.full_name,
            expire_minutes=int(DEVICE_LOGIN_CHALLENGE_TTL.total_seconds() // 60),
            attempt_limit=DEVICE_LOGIN_MAX_ATTEMPTS,
        ),
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không gửi được mã xác minh thiết bị. Vui lòng thử lại sau.",
        )
    add_in_app_notification(
        db,
        user_id=user.id,
        title="Thiết bị mới đang yêu cầu đăng nhập",
        body=(
            "Một thiết bị mới vừa nhập đúng thông tin tài khoản và được yêu cầu xác minh OTP. "
            "Phiên hiện tại vẫn an toàn và chỉ bị đăng xuất nếu thiết bị mới hoàn tất xác minh vị trí."
        ),
        kind="security",
        mandatory=True,
    )
    db.commit()
    return DeviceVerificationRequiredResponse(
        verification_token=create_device_login_verification_token(
            user_id=str(user.id),
            verification_id=str(record.id),
            token_version=record.token_version,
        ),
        email=user.email,
        expires_in_seconds=int(DEVICE_LOGIN_CHALLENGE_TTL.total_seconds()),
        resend_available_in_seconds=int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds()),
        message="Mã xác minh đã được gửi về email của bạn.",
    )


@router.post("/register/check-availability", response_model=dict[str, bool | str])
def check_registration_availability(
    payload: RegisterAvailabilityRequest,
    db: Session = Depends(get_db),
) -> dict[str, bool | str]:
    result: dict[str, bool | str] = {"email_available": True, "phone_available": True}
    if payload.email is not None:
        email = str(payload.email).strip().lower()
        if db.scalar(select(User.id).where(User.email == email)):
            result.update(email_available=False, email_message="Email này đã được sử dụng")
    if payload.phone:
        if db.scalar(select(User.id).where(User.phone == payload.phone)):
            result.update(phone_available=False, phone_message="Số điện thoại này đã tồn tại trong hệ thống")
    return result


@router.post("/register/request-otp", response_model=dict[str, str])
def request_registration_otp(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    email = str(payload.email).strip().lower()
    conflicts: dict[str, str] = {}
    if db.scalar(select(User).where(User.email == email)):
        conflicts["email"] = "Email này đã được sử dụng"
    if db.scalar(select(User.id).where(User.phone == payload.phone)):
        conflicts["phone"] = "Số điện thoại này đã tồn tại trong hệ thống"
    if conflicts:
        raise HTTPException(status_code=409, detail=conflicts)

    existing = db.scalar(select(RegistrationVerification).where(RegistrationVerification.email == email))
    now = datetime.now(UTC)
    if existing and now - existing.created_at < timedelta(seconds=60):
        raise HTTPException(status_code=429, detail="Vui lòng đợi 60 giây trước khi gửi lại mã")

    otp = f"{secrets.randbelow(1_000_000):06d}"
    record = existing or RegistrationVerification(email=email, created_at=now)
    record.full_name = payload.full_name.strip()
    record.phone = payload.phone
    record.hashed_password = hash_password(payload.password)
    record.otp_hash = hash_verification_code(otp)
    record.expires_at = now + timedelta(minutes=10)
    record.attempts = 0
    db.add(record)
    db.flush()

    if not send_email(
        to=email,
        subject="[Timi] Mã xác minh đăng ký",
        html=_registration_otp_email(otp=otp, full_name=record.full_name),
    ):
        db.rollback()
        raise HTTPException(status_code=503, detail="Không gửi được mã xác minh. Vui lòng thử lại sau.")
    db.commit()
    return {"message": "Mã xác minh đã được gửi về email của bạn."}


@router.post("/register/verify-otp", response_model=dict[str, str], status_code=status.HTTP_201_CREATED)
def verify_registration_otp(
    payload: RegisterOtpRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    email = str(payload.email).strip().lower()
    record = db.scalar(
        select(RegistrationVerification).where(RegistrationVerification.email == email).with_for_update()
    )
    now = datetime.now(UTC)
    if record is None:
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    if now > record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    if not verification_code_matches(payload.otp.strip(), record.otp_hash):
        record.attempts += 1
        if record.attempts >= 5:
            db.delete(record)
            db.commit()
            raise HTTPException(status_code=400, detail="Mã xác minh sai quá nhiều lần. Hãy yêu cầu mã mới.")
        db.commit()
        raise HTTPException(status_code=400, detail="Mã xác minh không đúng")
    if db.scalar(select(User).where(User.email == email)):
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=409, detail="Email đã được sử dụng")
    user = User(
        email=email,
        full_name=record.full_name,
        phone=record.phone,
        hashed_password=record.hashed_password,
        role=UserRole.USER.value,
        timi_bank_enabled=True,
    )
    db.add(user)
    try:
        db.flush()
        db.add(FaceVerificationState(user_id=user.id))
        db.delete(record)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email hoặc số điện thoại đã được sử dụng") from None
    return {"message": "Đăng ký thành công. Vui lòng đăng nhập để xác nhận vị trí."}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Đăng ký mới cần xác minh mã OTP qua email trước.",
    )


@router.post("/login", response_model=TokenResponse | DeviceVerificationRequiredResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse | DeviceVerificationRequiredResponse:
    """Verify credentials, then require email OTP when the browser is new."""
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == str(payload.email)).with_for_update())
    if user is None:
        # Keep unknown-email and wrong-password requests in the same bcrypt
        # timing class without storing attacker-controlled identifiers.
        verify_password(payload.password, _DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    remaining = lock_remaining_seconds(user, "login")
    if remaining:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(remaining)},
            detail=f"Đăng nhập đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
        )
    if not verify_password(payload.password, user.hashed_password):
        locked_for = record_failure(
            user,
            "login",
            failure_limit=settings.login_failure_limit,
            lock_seconds=settings.login_lock_seconds,
        )
        db.commit()
        if locked_for:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(locked_for)},
                detail=f"Đăng nhập sai quá nhiều lần. Tài khoản tạm khóa {locked_for} giây.",
            )
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
    clear_failures(user, "login")
    db.flush()
    return _login_response_for_device(
        db,
        user=user,
        device_hash=device_hash_from_id(payload.device_id),
        remember_me=payload.remember_me,
    )


@router.post("/login/device/resend", response_model=DeviceVerificationRequiredResponse)
def resend_login_device_code(
    payload: DeviceLoginResendRequest,
    db: Session = Depends(get_db),
) -> DeviceVerificationRequiredResponse:
    """Replace an active new-device OTP after the server-side cooldown."""
    try:
        claims = decode_device_login_verification_token(payload.verification_token)
        user_id = uuid.UUID(str(claims["sub"]))
        verification_id = uuid.UUID(str(claims["verification_id"]))
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên xác minh thiết bị không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.",
        ) from None

    user = _locked_user(db, user_id)
    record = db.scalar(
        select(DeviceLoginVerification)
        .where(
            DeviceLoginVerification.id == verification_id,
            DeviceLoginVerification.user_id == user.id,
        )
        .with_for_update()
    )
    now = datetime.now(UTC)
    token_version = claims.get("token_version")
    if (
        record is None
        or type(token_version) is not int
        or token_version != user.auth_token_version
        or record.token_version != user.auth_token_version
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên xác minh thiết bị không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.",
        )
    if now >= record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên xác minh thiết bị đã hết hạn. Hãy đăng nhập lại.",
        )

    elapsed = now - record.created_at
    if elapsed < DEVICE_LOGIN_RESEND_COOLDOWN:
        retry_after = max(
            1,
            int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds()) - int(elapsed.total_seconds()),
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            detail=f"Vui lòng đợi {retry_after} giây trước khi gửi lại mã.",
        )

    otp = f"{secrets.randbelow(1_000_000):06d}"
    record.otp_hash = hash_verification_code(otp)
    record.expires_at = now + DEVICE_LOGIN_CHALLENGE_TTL
    record.created_at = now
    record.attempts = 0
    db.add(record)
    add_audit_log(
        db,
        action="auth.device_verification_resent",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"new_device": True},
    )
    if not send_email(
        to=user.email,
        subject="[Timi] Mã xác minh thiết bị đăng nhập mới",
        html=_device_login_otp_email(
            otp=otp,
            full_name=user.full_name,
            expire_minutes=int(DEVICE_LOGIN_CHALLENGE_TTL.total_seconds() // 60),
            attempt_limit=DEVICE_LOGIN_MAX_ATTEMPTS,
        ),
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không gửi được mã xác minh thiết bị. Vui lòng thử lại sau.",
        )
    db.commit()
    return DeviceVerificationRequiredResponse(
        verification_token=create_device_login_verification_token(
            user_id=str(user.id),
            verification_id=str(record.id),
            token_version=record.token_version,
        ),
        email=user.email,
        expires_in_seconds=int(DEVICE_LOGIN_CHALLENGE_TTL.total_seconds()),
        resend_available_in_seconds=int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds()),
        message="Mã xác minh mới đã được gửi về email của bạn.",
    )


@router.post("/login/device/verify", response_model=TokenResponse)
def verify_login_device(
    payload: DeviceLoginOtpRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Exchange one correct, single-use device OTP for a pending-location proof."""
    try:
        claims = decode_device_login_verification_token(payload.verification_token)
        user_id = uuid.UUID(str(claims["sub"]))
        verification_id = uuid.UUID(str(claims["verification_id"]))
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên xác minh thiết bị không hợp lệ hoặc đã hết hạn",
        ) from None

    user = _locked_user(db, user_id)
    record = db.scalar(
        select(DeviceLoginVerification)
        .where(
            DeviceLoginVerification.id == verification_id,
            DeviceLoginVerification.user_id == user.id,
        )
        .with_for_update()
    )
    now = datetime.now(UTC)
    token_version = claims.get("token_version")
    if (
        record is None
        or type(token_version) is not int
        or token_version != user.auth_token_version
        or record.token_version != user.auth_token_version
        or now >= record.expires_at
    ):
        if record is not None:
            db.delete(record)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên xác minh thiết bị không hợp lệ hoặc đã hết hạn",
        )

    if not verification_code_matches(payload.otp, record.otp_hash):
        record.attempts += 1
        if record.attempts >= DEVICE_LOGIN_MAX_ATTEMPTS:
            db.delete(record)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã xác minh sai quá nhiều lần. Hãy đăng nhập lại để nhận mã mới.",
            )
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mã xác minh không đúng")

    device_hash = record.device_hash
    remember_me = record.remember_me
    db.delete(record)
    add_audit_log(
        db,
        action="auth.device_verified",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"new_device": True},
    )
    db.commit()
    db.refresh(user)
    return _token_response_for(
        user,
        remember_me=remember_me,
        require_location=True,
        device_hash=device_hash,
    )


@router.post(
    "/google",
    response_model=TokenResponse | GooglePhoneCompletionResponse | DeviceVerificationRequiredResponse,
)
def login_with_google(
    payload: GoogleLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse | GooglePhoneCompletionResponse | DeviceVerificationRequiredResponse:
    """Sign in with a server-verified Google ID token.

    New Google identities receive a short-lived completion proof instead of an
    app session, so they must supply the mandatory Timi phone number first.
    """
    google_subject, email, full_name = _verified_google_identity(payload.credential)
    device_hash = device_hash_from_id(payload.device_id)
    user = db.scalar(select(User).where(User.google_subject == google_subject).with_for_update())
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
        if user.phone:
            # Returning Google users normally have unchanged profile data.
            # Avoid an unnecessary write + refresh round-trip to the database.
            if user.full_name != full_name:
                user.full_name = full_name
                db.flush()
            return _login_response_for_device(
                db,
                user=user,
                device_hash=device_hash,
                remember_me=payload.remember_me,
            )

        return GooglePhoneCompletionResponse(
            phone_completion_token=create_google_phone_completion_token(
                google_subject=google_subject,
                email=user.email,
                full_name=full_name,
                remember_me=payload.remember_me,
                device_hash=device_hash,
            ),
            email=user.email,
            full_name=full_name,
        )

    # Do not link a Google account to an existing password account based only
    # on an email match. The Google `sub` is the immutable identity key; an
    # automatic email-only link could allow takeover of certain third-party
    # email addresses whose ownership later changes.
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(
            status_code=409,
            detail="Email này đã có tài khoản. Hãy đăng nhập bằng phương thức hiện tại của bạn.",
        )

    return GooglePhoneCompletionResponse(
        phone_completion_token=create_google_phone_completion_token(
            google_subject=google_subject,
            email=email,
            full_name=full_name,
            remember_me=payload.remember_me,
            device_hash=device_hash,
        ),
        email=email,
        full_name=full_name,
    )


@router.post(
    "/google/complete-phone",
    response_model=TokenResponse | DeviceVerificationRequiredResponse,
    status_code=status.HTTP_201_CREATED,
)
def complete_google_phone(
    payload: GooglePhoneCompletionRequest,
    db: Session = Depends(get_db),
) -> TokenResponse | DeviceVerificationRequiredResponse:
    """Create the local Google account only after a valid phone is supplied."""
    try:
        profile = decode_google_phone_completion_token(payload.phone_completion_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Phiên hoàn tất đăng nhập Google đã hết hạn") from exc

    google_subject = profile["google_subject"]
    email = profile["email"]
    full_name = profile["full_name"]
    user = db.scalar(select(User).where(User.google_subject == google_subject).with_for_update())
    created = user is None
    if user is None:
        if db.scalar(select(User.id).where(User.email == email)):
            raise HTTPException(
                status_code=409,
                detail="Email này đã có tài khoản. Hãy đăng nhập bằng phương thức hiện tại của bạn.",
            )
        user = User(
            email=email,
            google_subject=google_subject,
            full_name=full_name,
            phone=payload.phone,
            # Local password login is deliberately unusable for a Google-only
            # account, while keeping the legacy non-null database column.
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role=UserRole.USER.value,
            timi_bank_enabled=True,
        )
        db.add(user)
    else:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
        user.phone = payload.phone
        user.full_name = full_name
        user.timi_bank_enabled = True

    try:
        db.flush()
        if created:
            db.add(FaceVerificationState(user_id=user.id))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Số điện thoại này đã là tài khoản Timi Bank") from None

    db.refresh(user)
    user = _locked_user(db, user.id)
    return _login_response_for_device(
        db,
        user=user,
        device_hash=str(profile["device_hash"]),
        remember_me=bool(profile["remember_me"]),
    )


@router.post("/login/location", response_model=LoginLocationResponse)
def record_login_location(
    payload: LoginLocationRequest,
    request: Request,
    db: Session = Depends(get_db),
    pending_login: PendingLogin = Depends(get_pending_login),
) -> LoginLocationResponse:
    """Record location, atomically activate this device, and revoke the old session."""
    user = _locked_user(db, pending_login.user.id)
    token_version = pending_login.claims.get("token_version")
    expected_device_hash = pending_login.claims.get("device_hash")
    if (
        type(token_version) is not int
        or token_version != user.auth_token_version
        or not isinstance(expected_device_hash, str)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập đã bị thu hồi")
    security_signals = _record_login_context(
        db,
        user=user,
        payload=payload,
        request=request,
        expected_device_hash=expected_device_hash,
    )
    if security_signals:
        add_in_app_notification(
            db,
            user_id=user.id,
            title="Phát hiện đăng nhập cần chú ý",
            body="Timi ghi nhận thiết bị, mạng hoặc vị trí đăng nhập khác với lịch sử gần đây.",
            kind="security",
        )
    # The version rotation is committed together with the login context. Every
    # access token and pending-login proof issued to the previous device becomes
    # invalid at this point; an abandoned new-device flow never revokes it.
    confirmed_at = datetime.now(UTC)
    user.last_login_device_hash = expected_device_hash
    user.last_login_location_confirmed_at = confirmed_at
    user.trusted_device_until = confirmed_at + TRUSTED_LOGIN_DEVICE_TTL
    user.auth_token_version += 1
    db.commit()
    db.refresh(user)
    remember_me = bool(pending_login.claims.get("remember_me"))
    return LoginLocationResponse(
        access_token=create_access_token(
            subject=str(user.id),
            role=user.role,
            expires_delta=(timedelta(days=get_settings().remember_me_expire_days) if remember_me else None),
            token_version=user.auth_token_version,
            location_confirmed=True,
        ),
        user=UserOut.model_validate(user),
        location_confirmation_required=False,
    )


@router.put("/face/enrollment", response_model=FaceVerificationResponse)
def enroll_face(
    payload: FaceEnrollmentRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> FaceVerificationResponse:
    if not payload.consent:
        raise HTTPException(status_code=422, detail="Cần đồng ý lưu dữ liệu khuôn mặt để đăng ký")
    settings = get_settings()
    _configure_cloudinary()
    frames = _face_frames(payload.image_data)
    validate_multiframe_liveness(frames)
    embeddings = [embedding_from_data_url(frame) for frame in frames]
    aggregate_embedding = aggregate_embeddings(embeddings)
    reference_frame = frames[0]
    image = _data_url_bytes(reference_frame)
    try:
        # The embedding service already validates and crops the primary face.
        # Store a smaller face-focused reference so uploads and future reads
        # do not carry unnecessary background pixels.
        uploaded = cloudinary.uploader.upload(
            image,
            folder="fintechguard/face-enrollments",
            public_id=str(current_user.id),
            overwrite=True,
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png"],
            transformation=[{"width": 256, "height": 256, "crop": "fill", "gravity": "face", "zoom": 0.85}],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể lưu ảnh khuôn mặt lên Cloudinary") from exc
    row = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id))
    cloudinary_public_id = str(uploaded.get("public_id") or f"fintechguard/face-enrollments/{current_user.id}")
    if row is None:
        row = FaceEnrollment(
            user_id=current_user.id,
            reference_image_url=uploaded["secure_url"],
            reference_embedding=aggregate_embedding.tolist(),
            model_id=settings.face_embedding_version,
            similarity_threshold=settings.face_similarity_threshold,
            consent_at=datetime.now(UTC),
            is_active=True,
            metadata_json={"cloudinary_public_id": cloudinary_public_id, "storage_provider": "cloudinary"},
        )
        db.add(row)
        db.flush()
    else:
        row.reference_image_url, row.reference_embedding = uploaded["secure_url"], aggregate_embedding.tolist()
        row.model_id, row.similarity_threshold, row.consent_at, row.is_active, row.revoked_at = (
            settings.face_embedding_version,
            settings.face_similarity_threshold,
            datetime.now(UTC),
            True,
            None,
        )
        row.metadata_json = {"cloudinary_public_id": cloudinary_public_id, "storage_provider": "cloudinary"}
    db.add(
        FaceVerificationLog(
            user_id=current_user.id,
            enrollment_id=row.id,
            purpose="enrollment",
            similarity=1,
            threshold=settings.face_similarity_threshold,
            matched=True,
            model_id=settings.face_embedding_version,
            created_at=datetime.now(UTC),
        )
    )
    add_audit_log(
        db,
        action="auth.face_enrolled",
        actor_id=current_user.id,
        resource_type="face_enrollment",
        resource_id=row.id,
        metadata={"model_id": settings.face_embedding_version, "sample_count": len(embeddings)},
    )
    db.commit()
    return FaceVerificationResponse(
        matched=True,
        similarity=1,
        threshold=settings.face_similarity_threshold,
        message="Đã đăng ký khuôn mặt độc lập với ảnh đại diện.",
    )


@router.delete("/face/enrollment", status_code=status.HTTP_204_NO_CONTENT)
def delete_face_enrollment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete the biometric template and its external reference image."""
    row = db.scalar(select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id).with_for_update())
    if row is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    _configure_cloudinary()
    public_id = str(
        (row.metadata_json or {}).get("cloudinary_public_id") or f"fintechguard/face-enrollments/{current_user.id}"
    )
    try:
        result = cloudinary.uploader.destroy(
            public_id,
            invalidate=True,
            resource_type="image",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Không thể xóa ảnh khuôn mặt khỏi nơi lưu trữ",
        ) from exc
    if str(result.get("result", "")).lower() not in {"ok", "not found"}:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Nơi lưu trữ chưa xác nhận xóa ảnh khuôn mặt",
        )

    enrollment_id = row.id
    db.delete(row)
    add_audit_log(
        db,
        action="auth.face_enrollment_deleted",
        actor_id=current_user.id,
        resource_type="face_enrollment",
        resource_id=enrollment_id,
        metadata={"external_image_deleted": True},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/face/quality")
def face_quality(
    payload: FaceVerificationRequest,
    _current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    frame = _face_frames(payload.image_data)[0]
    rule = face_quality_rule_from_data_url(frame)
    messages = {
        "obstructed_hand": "Vui lòng đưa tay ra khỏi khuôn mặt trước khi quét.",
        "obstructed_mask": "Vui lòng tháo khẩu trang khỏi khuôn mặt trước khi quét.",
        "obstructed_sunglasses": "Vui lòng tháo kính râm khỏi khuôn mặt trước khi quét.",
        "obstructed_glasses": "Vui lòng tháo kính hoặc vật cản khỏi khuôn mặt trước khi quét.",
        "obstructed_other": "Vui lòng loại bỏ mũ, nón hoặc vật cản khỏi khuôn mặt trước khi quét.",
        "model_unavailable": "Model kiểm tra khuôn mặt chưa sẵn sàng. Hệ thống đang tải model, hãy thử lại sau ít giây.",
        "anti_spoof_unavailable": "Model chống giả mạo chưa sẵn sàng. Hãy cài dependencies rồi thử lại.",
        "spoof_detected": "Không xác minh được người thật. Không dùng ảnh hoặc video trước camera.",
        "obstructed_eyes": "Vui lòng bỏ tay, kính tối hoặc vật cản khỏi vùng mắt.",
        "obstructed_mouth_chin": "Vui lòng bỏ tay, khẩu trang hoặc vật cản khỏi vùng miệng và cằm.",
        "obstructed_headwear": "Vui lòng bỏ mũ/nón hoặc vật cản khỏi vùng trán và đầu.",
        "obstructed_face": "Vui lòng loại bỏ các vật cản khỏi khuôn mặt trước khi quét.",
        "no_face": "Chưa thấy khuôn mặt. Hãy đưa toàn bộ mặt vào khung; nếu mặt đang quá nhỏ thì tiến gần camera hơn.",
        "multiple_faces": "Có nhiều khuôn mặt. Chỉ để một mình bạn trong khung.",
        "off_center": "Khuôn mặt đang lệch tâm. Hãy căn mặt vào giữa khung.",
        "off_center_left": "Khuôn mặt đang lệch sang trái. Hãy dịch mặt sang phải một chút.",
        "off_center_right": "Khuôn mặt đang lệch sang phải. Hãy dịch mặt sang trái một chút.",
        "off_center_top": "Khuôn mặt đang quá cao. Hãy hạ camera hoặc đưa mặt xuống một chút.",
        "off_center_bottom": "Khuôn mặt đang quá thấp. Hãy nâng camera hoặc đưa mặt lên một chút.",
        "too_far": "Khuôn mặt đang quá xa hoặc quá nhỏ. Hãy tiến gần camera thêm một chút.",
        "too_near": "Khuôn mặt đang quá gần camera. Hãy lùi ra xa một chút để thấy trọn khuôn mặt.",
        "lighting": "Ánh sáng chưa đạt. Hãy tăng sáng hoặc tránh ánh sáng chiếu thẳng.",
        "blurry": "Khuôn mặt đang bị mờ. Hãy giữ camera và khuôn mặt yên.",
        "invalid_image": "Không đọc được ảnh camera. Hãy thử lại.",
    }
    return {
        "ready": rule == "ready",
        "rule": rule,
        "pose": face_pose_from_data_url(frame),
        "message": messages.get(rule, "Khung hình chưa đạt yêu cầu."),
    }


@router.post("/face/verify", response_model=FaceVerificationResponse)
def verify_face(
    payload: FaceVerificationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> FaceVerificationResponse:
    settings = get_settings()
    is_transaction_verification = payload.transaction_id is not None
    face_state = _face_state_for_update(db, current_user.id)
    remaining = _face_lock_remaining(face_state)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            headers={"Retry-After": str(remaining)},
            detail=f"Face ID đang tạm khóa. Vui lòng thử lại sau {remaining} giây.",
        )
    enrollment = db.scalar(
        select(FaceEnrollment).where(FaceEnrollment.user_id == current_user.id, FaceEnrollment.is_active.is_(True))
    )
    if enrollment is None:
        raise HTTPException(status_code=409, detail="Bạn chưa đăng ký khuôn mặt")
    if enrollment.model_id != settings.face_embedding_version:
        raise HTTPException(
            status_code=409, detail="Dữ liệu khuôn mặt cần được đăng ký lại để dùng chuẩn quét khuôn mặt mới"
        )

    threshold = (
        settings.face_transaction_similarity_threshold
        if is_transaction_verification
        else float(enrollment.similarity_threshold)
    )
    frames = _face_frames(payload.image_data)
    try:
        validate_multiframe_liveness(frames)
        similarity = similarity_from_embeddings(
            enrollment_embedding=enrollment.reference_embedding,
            selfie_data_urls=frames,
        )
    except HTTPException as exc:
        # Count user/capture rejections, but never punish an account for a
        # server/model outage. This closes the unlimited liveness retry path.
        if exc.status_code != status.HTTP_422_UNPROCESSABLE_CONTENT:
            raise
        failures, locked_for = _register_face_failure(
            face_state,
            failure_limit=settings.face_transaction_failure_limit,
            lock_seconds=settings.face_transaction_lock_seconds,
        )
        db.add(
            FaceVerificationLog(
                user_id=current_user.id,
                enrollment_id=enrollment.id,
                transaction_id=payload.transaction_id,
                purpose="transaction" if is_transaction_verification else "login",
                similarity=None,
                threshold=float(threshold),
                matched=False,
                model_id=enrollment.model_id,
                failure_reason="capture_or_liveness_rejected",
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
        if locked_for > 0:
            raise HTTPException(
                status_code=429,
                headers={"Retry-After": str(locked_for)},
                detail=f"Bạn đã xác thực Face ID sai {failures} lần. Chức năng tạm khóa {locked_for} giây.",
            ) from exc
        attempts_left = settings.face_transaction_failure_limit - failures
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{exc.detail} Bạn còn {attempts_left} lần thử trước khi Face ID tạm khóa.",
        ) from exc
    matched = similarity >= float(threshold)
    db.add(
        FaceVerificationLog(
            user_id=current_user.id,
            enrollment_id=enrollment.id,
            transaction_id=payload.transaction_id,
            purpose="transaction" if is_transaction_verification else "login",
            similarity=similarity,
            threshold=float(threshold),
            matched=matched,
            model_id=enrollment.model_id,
            failure_reason=None if matched else "similarity_below_threshold",
            created_at=datetime.now(UTC),
        )
    )
    locked_for = 0
    failures = 0
    if matched:
        face_state.failure_count = 0
        face_state.locked_until = None
    else:
        failures, locked_for = _register_face_failure(
            face_state,
            failure_limit=settings.face_transaction_failure_limit,
            lock_seconds=settings.face_transaction_lock_seconds,
        )
    db.commit()
    if not matched and locked_for > 0:
        raise HTTPException(
            status_code=429,
            headers={"Retry-After": str(locked_for)},
            detail=f"Bạn đã xác thực Face ID sai {failures} lần. Chức năng tạm khóa {locked_for} giây.",
        )
    token = (
        create_face_verification_token(
            user_id=str(current_user.id),
            transaction_id=str(payload.transaction_id) if payload.transaction_id else None,
            nonce=payload.nonce,
            amount=int(payload.amount) if payload.amount is not None else None,
        )
        if matched
        else None
    )
    attempts_left = max(0, settings.face_transaction_failure_limit - failures)
    return FaceVerificationResponse(
        matched=matched,
        similarity=similarity,
        threshold=float(threshold),
        message="Khuôn mặt khớp với dữ liệu đã đăng ký."
        if matched
        else f"Khuôn mặt chưa đủ độ khớp. Bạn còn {attempts_left} lần thử trước khi Face ID tạm khóa.",
        verification_token=token,
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Change a local password and revoke every previously issued JWT."""
    user = _locked_user(db, current_user.id)
    if user.google_subject:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tài khoản Google không sử dụng mật khẩu Timi.",
        )
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không đúng.",
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
    add_audit_log(
        db,
        action="auth.password_changed",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"sessions_revoked": True},
    )
    db.commit()
    db.refresh(user)
    return _token_response_for(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Revoke all access tokens for the account before ending this session."""
    user = _locked_user(db, current_user.id)
    user.auth_token_version += 1
    add_audit_log(
        db,
        action="auth.logged_out",
        actor_id=user.id,
        resource_type="user",
        resource_id=user.id,
        metadata={"sessions_revoked": True},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/overview", response_model=AccountOverview)
def account_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> AccountOverview:
    now = datetime.now(UTC)
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_month = start_today.replace(day=1)

    def count(since):
        return (
            db.scalar(
                select(func.count())
                .select_from(Transaction)
                .where(Transaction.user_id == current_user.id, Transaction.created_at >= since)
            )
            or 0
        )

    enrolled = bool(
        db.scalar(
            select(FaceEnrollment).where(
                FaceEnrollment.user_id == current_user.id,
                FaceEnrollment.is_active.is_(True),
                FaceEnrollment.model_id == get_settings().face_embedding_version,
            )
        )
    )
    has_pin = bool(current_user.transaction_pin_hash)
    checks = [
        SecurityCheck(
            label="Thông tin tài khoản", detail="Email và số điện thoại", score=40, completed=bool(current_user.phone)
        ),
        SecurityCheck(label="PIN giao dịch", detail="Xác nhận sau khi đăng nhập", score=30, completed=has_pin),
        SecurityCheck(label="Khuôn mặt", detail="Đã đăng ký độc lập với ảnh đại diện", score=30, completed=enrolled),
    ]
    score = sum(check.score for check in checks if check.completed)
    return AccountOverview(
        balance=current_user.balance,
        transactions_today=count(start_today),
        transactions_this_month=count(start_month),
        security_score=score,
        security_grade="A" if score >= 80 else "B" if score >= 50 else "C",
        transaction_pin_configured=has_pin,
        phone_configured=bool(current_user.phone),
        security_checks=checks,
    )


@router.put("/avatar", response_model=UserOut)
def upload_avatar(
    avatar: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> UserOut:
    if avatar.content_type not in _AVATAR_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP")
    content = avatar.file.read(_MAX_IMAGE_SIZE + 1)
    if not content or len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=422, detail="Ảnh đại diện không hợp lệ hoặc vượt quá 5 MB")
    _configure_cloudinary()
    try:
        result = cloudinary.uploader.upload(
            content,
            folder="fintechguard/avatars",
            public_id=str(current_user.id),
            overwrite=True,
            resource_type="image",
            allowed_formats=["jpg", "jpeg", "png", "webp"],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Không thể lưu ảnh đại diện") from exc
    current_user.avatar_url = result["secure_url"]
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.delete("/avatar", response_model=UserOut)
def delete_avatar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UserOut:
    """Remove the profile avatar without affecting the enrolled face data."""
    if current_user.avatar_url:
        _configure_cloudinary()
        try:
            cloudinary.uploader.destroy(
                f"fintechguard/avatars/{current_user.id}",
                invalidate=True,
                resource_type="image",
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Không thể xóa ảnh đại diện") from exc

    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


def _email_change_otp_email(*, otp: str, recipient_email: str, old_email: str, is_new_email: bool) -> str:
    label = "Gmail mới" if is_new_email else "Gmail hiện tại"
    safe_recipient = html.escape(recipient_email)
    safe_old_email = html.escape(old_email)
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
      <h2 style="color:#2563eb">Timi - Xác minh đổi Gmail</h2>
      <p>Mã xác minh cho <b>{label}</b> của tài khoản {safe_old_email} là:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;color:#1d4ed8">{otp}</p>
      <p>Mã có hiệu lực trong 10 phút. Email nhận mã: {safe_recipient}</p>
      <p style="color:#64748b;font-size:12px">Nếu bạn không yêu cầu đổi Gmail, hãy bỏ qua email này và đổi mật khẩu tài khoản.</p>
    </div>
    """


@router.post("/email-change/request", response_model=dict[str, str])
def request_email_change(
    payload: EmailChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    new_email = str(payload.new_email).strip().lower()
    current_email = current_user.email.strip().lower()
    if new_email == current_email:
        raise HTTPException(status_code=400, detail="Gmail mới phải khác Gmail hiện tại")
    if db.scalar(select(User.id).where(User.email == new_email, User.id != current_user.id)):
        raise HTTPException(status_code=409, detail="Gmail mới đã được sử dụng")

    existing = db.scalar(select(EmailChangeVerification).where(EmailChangeVerification.user_id == current_user.id))
    now = datetime.now(UTC)
    if existing and now - existing.created_at < timedelta(seconds=60):
        raise HTTPException(status_code=429, detail="Vui lòng đợi 60 giây trước khi gửi lại mã")

    old_otp = f"{secrets.randbelow(1_000_000):06d}"
    new_otp = f"{secrets.randbelow(1_000_000):06d}"
    record = existing or EmailChangeVerification(user_id=current_user.id, created_at=now)
    record.current_email = current_email
    record.new_email = new_email
    record.old_otp_hash = hash_verification_code(old_otp)
    record.new_otp_hash = hash_verification_code(new_otp)
    record.expires_at = now + timedelta(minutes=10)
    record.attempts = 0
    db.add(record)
    db.flush()

    old_sent = send_email(
        to=current_email,
        subject="[Timi] Mã xác minh đổi Gmail hiện tại",
        html=_email_change_otp_email(
            otp=old_otp, recipient_email=current_email, old_email=current_email, is_new_email=False
        ),
    )
    new_sent = send_email(
        to=new_email,
        subject="[Timi] Mã xác minh Gmail mới",
        html=_email_change_otp_email(
            otp=new_otp, recipient_email=new_email, old_email=current_email, is_new_email=True
        ),
    )
    if not old_sent or not new_sent:
        db.rollback()
        raise HTTPException(status_code=503, detail="Không thể gửi đủ mã xác minh. Vui lòng thử lại sau.")
    db.commit()
    return {"message": "Mã xác minh đã được gửi tới Gmail cũ và Gmail mới."}


@router.post("/email-change/verify", response_model=UserOut)
def verify_email_change(
    payload: EmailChangeVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    record = db.scalar(
        select(EmailChangeVerification).where(EmailChangeVerification.user_id == current_user.id).with_for_update()
    )
    now = datetime.now(UTC)
    if record is None:
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    if now > record.expires_at:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=400, detail="Mã xác minh không hợp lệ hoặc đã hết hạn")
    old_valid = verification_code_matches(payload.old_otp, record.old_otp_hash)
    new_valid = verification_code_matches(payload.new_otp, record.new_otp_hash)
    if not old_valid or not new_valid:
        record.attempts += 1
        if record.attempts >= 5:
            db.delete(record)
            db.commit()
            raise HTTPException(status_code=400, detail="Mã xác minh sai quá nhiều lần. Hãy yêu cầu mã mới.")
        db.commit()
        raise HTTPException(status_code=400, detail="Mã xác minh Gmail cũ hoặc Gmail mới không đúng")
    if db.scalar(select(User.id).where(User.email == record.new_email, User.id != current_user.id)):
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=409, detail="Gmail mới đã được sử dụng")
    current_user.email = record.new_email
    db.delete(record)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.put("/transaction-pin")
def set_transaction_pin(
    payload: TransactionPinRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, bool]:
    user = _locked_user(db, current_user.id)
    if user.transaction_pin_hash:
        if not payload.current_pin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cần nhập mã PIN hiện tại",
            )
        _verify_transaction_pin(db, user, payload.current_pin)
    user.transaction_pin_hash = hash_password(payload.pin)
    clear_failures(user, "pin")
    db.commit()
    return {"configured": True}


@router.get("/transaction-pin/status")
def transaction_pin_status(current_user: User = Depends(get_current_user)) -> dict[str, bool]:
    return {"configured": bool(current_user.transaction_pin_hash)}


@router.post("/cards/verify-pin")
def verify_card_creation_pin(
    payload: UserCardPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool | str]:
    user = _locked_user(db, current_user.id)
    _verify_transaction_pin(db, user, payload.pin)
    verification_token = create_card_action_token(
        user_id=str(user.id),
        token_version=user.auth_token_version,
    )
    db.commit()
    return {"verified": True, "verification_token": verification_token}


@router.get("/cards", response_model=list[UserCardSummary])
def list_user_cards(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    cards = db.scalars(
        select(UserCard)
        .where(UserCard.user_id == current_user.id, UserCard.is_active.is_(True))
        .order_by(UserCard.created_at.desc())
    ).all()
    return [_card_summary(card) for card in cards]


@router.post("/cards", response_model=UserCardSummary, status_code=status.HTTP_201_CREATED)
def add_user_card(
    payload: UserCardCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, Any]:
    try:
        decode_card_action_token(
            payload.card_verification_token,
            user_id=str(current_user.id),
            token_version=current_user.auth_token_version,
        )
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cần xác minh PIN lại trước khi tạo thẻ.",
        ) from None
    card_number = str(secrets.randbelow(900_000_000_000) + 100_000_000_000)
    cvv = f"{secrets.randbelow(1000):03d}"
    created_at = datetime.now(UTC)
    card = UserCard(
        user_id=current_user.id,
        nickname=payload.nickname.strip(),
        card_number_encrypted=_card_cipher().encrypt(card_number.encode()).decode(),
        cvv_encrypted=_card_cipher().encrypt(cvv.encode()).decode(),
        holder_name=payload.holder_name.strip().upper(),
        expiry_month=created_at.month,
        expiry_year=created_at.year + 8,
        brand=payload.brand.strip(),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return _card_summary(card)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_card(
    card_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> Response:
    card = db.scalar(
        select(UserCard).where(
            UserCard.id == card_id, UserCard.user_id == current_user.id, UserCard.is_active.is_(True)
        )
    )
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thẻ")
    db.delete(card)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/cards/{card_id}/details", response_model=UserCardDetail)
def reveal_user_card(
    card_id: uuid.UUID,
    payload: UserCardPinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    user = _locked_user(db, current_user.id)
    _verify_transaction_pin(db, user, payload.pin)
    card = db.scalar(
        select(UserCard).where(
            UserCard.id == card_id, UserCard.user_id == current_user.id, UserCard.is_active.is_(True)
        )
    )
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thẻ")
    try:
        number = _decrypt_card_value(card.card_number_encrypted)
    except InvalidToken as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Không thể đọc thông tin thẻ"
        ) from exc
    db.commit()
    return {**_card_summary(card), "card_number": number, "cvv": _card_cvv(card)}


@router.get("/face/enrollment/status")
def face_enrollment_status(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> dict[str, bool]:
    enrolled = bool(
        db.scalar(
            select(FaceEnrollment).where(
                FaceEnrollment.user_id == current_user.id,
                FaceEnrollment.is_active.is_(True),
                FaceEnrollment.model_id == get_settings().face_embedding_version,
            )
        )
    )
    return {"configured": enrolled}
