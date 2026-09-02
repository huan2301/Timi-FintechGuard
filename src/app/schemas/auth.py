import re
import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from src.app.core.security import validate_password_strength
from src.app.schemas.risk import RiskClientContextIn
from src.app.schemas.user import UserOut

_MAX_FACE_CAPTURE_LENGTH = 7_000_000
_MAX_FACE_CAPTURE_FRAMES = 6


def _validate_face_image_data(value: object) -> str | list[str]:
    """Keep a short capture burst valid without applying string limits to a list."""
    if isinstance(value, str):
        frames = [value]
    elif isinstance(value, list) and value and all(isinstance(item, str) for item in value):
        frames = value
    else:
        raise ValueError("Ảnh khuôn mặt không hợp lệ")

    if len(frames) > _MAX_FACE_CAPTURE_FRAMES:
        raise ValueError("Số lượng khung hình khuôn mặt không hợp lệ")
    if any(len(frame) < 20 for frame in frames):
        raise ValueError("Ảnh khuôn mặt không hợp lệ")
    if sum(len(frame) for frame in frames) > _MAX_FACE_CAPTURE_LENGTH:
        raise ValueError("Dữ liệu khuôn mặt vượt quá giới hạn cho phép")
    return value


class LoginRiskClientContextIn(RiskClientContextIn):
    """Login requires a browser device ID and coarse location permission."""

    device_id: str = Field(..., min_length=16, max_length=128)

    def model_post_init(self, __context: object) -> None:
        super().model_post_init(__context)
        if self.geo_latitude is None or self.geo_longitude is None:
            raise ValueError("Cần cấp vị trí gần đúng để đăng nhập")
        if self.geo_accuracy_m is None:
            raise ValueError("Thiếu độ chính xác của vị trí đăng nhập")


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    phone: str = Field(..., min_length=10, max_length=10)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_timi_account_phone(cls, value: object) -> str:
        phone = re.sub(r"\s+", "", str(value or ""))
        if not re.fullmatch(r"\d{10}", phone):
            raise ValueError("Số điện thoại phải gồm đúng 10 chữ số")
        return phone


class RegisterOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)


class RegisterAvailabilityRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=10, max_length=10)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    device_id: str = Field(..., min_length=16, max_length=128)
    remember_me: bool = False


class GoogleLoginRequest(BaseModel):
    """ID token returned by Google Identity Services after user consent."""

    credential: str = Field(..., min_length=20, max_length=12_000)
    device_id: str = Field(..., min_length=16, max_length=128)
    remember_me: bool = False


class GooglePhoneCompletionRequest(BaseModel):
    """Complete a first Google sign-in with the required Timi phone number."""

    phone_completion_token: str = Field(..., min_length=20, max_length=12_000)
    phone: str = Field(..., min_length=10, max_length=10)

    @field_validator("phone", mode="before")
    @classmethod
    def normalize_timi_account_phone(cls, value: object) -> str:
        return RegisterRequest.normalize_timi_account_phone(value)


class DeviceLoginOtpRequest(BaseModel):
    verification_token: str = Field(..., min_length=20, max_length=4096)
    otp: str = Field(..., pattern=r"^\d{6}$")


class DeviceLoginResendRequest(BaseModel):
    verification_token: str = Field(..., min_length=20, max_length=4096)


class LoginLocationRequest(BaseModel):
    """Mandatory location submission immediately after an authenticated login."""

    client_context: LoginRiskClientContextIn


class TransactionPinRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")
    current_pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserCardCreate(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=80)
    holder_name: str = Field(..., min_length=2, max_length=255)
    expiry_month: int = Field(..., ge=1, le=12)
    expiry_year: int = Field(..., ge=2024, le=2100)
    brand: str = Field(default="Visa", min_length=2, max_length=40)
    card_verification_token: str = Field(..., min_length=20, max_length=4096)


class UserCardSummary(BaseModel):
    id: uuid.UUID
    nickname: str
    masked_number: str
    holder_name: str
    expiry_month: int
    expiry_year: int
    brand: str


class UserCardDetail(UserCardSummary):
    card_number: str
    cvv: str


class UserCardPinRequest(BaseModel):
    pin: str = Field(..., pattern=r"^\d{4,6}$")


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


class EmailChangeVerifyRequest(BaseModel):
    old_otp: str = Field(..., pattern=r"^\d{6}$")
    new_otp: str = Field(..., pattern=r"^\d{6}$")


class FaceVerificationRequest(BaseModel):
    image_data: str | list[str]
    transaction_id: uuid.UUID | None = None
    nonce: str | None = Field(default=None, min_length=8, max_length=256)
    amount: int | None = Field(default=None, ge=0, le=10_000_000_000)

    @field_validator("image_data")
    @classmethod
    def validate_image_data(cls, value: object) -> str | list[str]:
        return _validate_face_image_data(value)


class FaceEnrollmentRequest(BaseModel):
    image_data: str | list[str]
    consent: bool

    @field_validator("image_data")
    @classmethod
    def validate_image_data(cls, value: object) -> str | list[str]:
        return _validate_face_image_data(value)


class FaceVerificationResponse(BaseModel):
    matched: bool
    similarity: float = Field(..., ge=0, le=1)
    threshold: float = Field(..., ge=0, le=1)
    message: str
    verification_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    location_confirmation_required: bool = False


class DeviceVerificationRequiredResponse(BaseModel):
    """Returned after valid primary credentials when this browser is new."""

    device_verification_required: Literal[True] = True
    verification_token: str
    email: EmailStr
    expires_in_seconds: int = Field(..., ge=1)
    resend_available_in_seconds: int = Field(default=60, ge=0)
    message: str


class GooglePhoneCompletionResponse(BaseModel):
    """Returned instead of an app session when a Google user needs a phone."""

    requires_phone: Literal[True] = True
    phone_completion_token: str
    email: EmailStr
    full_name: str


class LoginLocationResponse(TokenResponse):
    recorded: bool = True


class AccountOverview(BaseModel):
    """Live account metrics shown on the authenticated user's profile."""

    balance: int
    transactions_today: int
    transactions_this_month: int
    security_score: int = Field(..., ge=0, le=100)
    security_grade: str
    transaction_pin_configured: bool
    phone_configured: bool
    security_checks: list["SecurityCheck"]


class SecurityCheck(BaseModel):
    label: str
    detail: str
    score: int
    completed: bool


AuthResponse = TokenResponse
