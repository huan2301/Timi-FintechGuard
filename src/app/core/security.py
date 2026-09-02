"""Password hashing and purpose-bound JWT helpers for active API routers."""

import hashlib
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from jwt import InvalidTokenError as JWTError

from src.app.config import get_settings
from src.app.core.policies import DEVICE_LOGIN_CHALLENGE_TTL

_PASSWORD_HASH_PREFIX = "bcrypt-sha256$"


def _password_digest(password: str) -> bytes:
    """Pre-hash so bcrypt never silently truncates a UTF-8 password."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("ascii")


def hash_password(password: str) -> str:
    """Hash a full password while keeping compatibility with bcrypt storage."""
    hashed = bcrypt.hashpw(_password_digest(password), bcrypt.gensalt()).decode("utf-8")
    return f"{_PASSWORD_HASH_PREFIX}{hashed}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith(_PASSWORD_HASH_PREFIX):
            bcrypt_hash = hashed_password.removeprefix(_PASSWORD_HASH_PREFIX)
            return bcrypt.checkpw(_password_digest(plain_password), bcrypt_hash.encode("utf-8"))
        # Legacy rows used raw bcrypt input. Retain read compatibility so users
        # can log in and migrate naturally on their next password change/reset.
        return bcrypt.checkpw(plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def validate_password_strength(password: str) -> str:
    """Apply the same password policy to registration, change and reset."""
    missing: list[str] = []
    if len(password) < 8:
        missing.append("ít nhất 8 ký tự")
    if len(password) > 128:
        missing.append("không quá 128 ký tự")
    if not re.search(r"[A-Z]", password):
        missing.append("1 chữ viết hoa")
    if not re.search(r"[a-z]", password):
        missing.append("1 chữ viết thường")
    if not re.search(r"\d", password):
        missing.append("1 chữ số")
    if not re.search(r"[^A-Za-z0-9]", password):
        missing.append("1 ký tự đặc biệt")
    if missing:
        raise ValueError(f"Mật khẩu còn thiếu: {', '.join(missing)}")
    return password


def create_access_token(
    subject: str | dict[str, Any],
    role: str | None = None,
    expires_delta: timedelta | None = None,
    *,
    token_version: int = 0,
    location_confirmed: bool = True,
) -> str:
    """Create a signed JWT.

    ``dict`` input is accepted temporarily for compatibility with unmounted
    legacy routers. New code passes a subject UUID and role explicitly.
    """
    settings = get_settings()
    payload = dict(subject) if isinstance(subject, dict) else {"sub": subject}
    if role is not None:
        payload["role"] = role
    payload.setdefault("token_version", token_version)
    payload.setdefault("location_confirmed", location_confirmed)
    payload.setdefault("jti", uuid.uuid4().hex)
    expires_at = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload["exp"] = expires_at
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_login_location_token(
    *,
    user_id: str,
    role: str,
    token_version: int,
    remember_me: bool,
    device_hash: str,
) -> str:
    """Issue a credential that can only complete post-login location setup."""
    settings = get_settings()
    return jwt.encode(
        {
            "sub": user_id,
            "role": role,
            "purpose": "login_location",
            "token_version": token_version,
            "remember_me": remember_me,
            "device_hash": device_hash,
            "jti": uuid.uuid4().hex,
            "exp": datetime.now(UTC) + timedelta(minutes=10),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_device_login_verification_token(
    *,
    user_id: str,
    verification_id: str,
    token_version: int,
) -> str:
    """Create a proof that identifies one server-side new-device OTP challenge."""
    settings = get_settings()
    return jwt.encode(
        {
            "sub": user_id,
            "verification_id": verification_id,
            "purpose": "device_login_verification",
            "token_version": token_version,
            "jti": uuid.uuid4().hex,
            "exp": datetime.now(UTC) + DEVICE_LOGIN_CHALLENGE_TTL,
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_device_login_verification_token(token: str) -> dict[str, Any]:
    """Validate a purpose-bound new-device challenge without authenticating it."""
    payload = decode_access_token(token)
    token_version = payload.get("token_version")
    if payload.get("purpose") != "device_login_verification" or type(token_version) is not int:
        raise ValueError("Invalid device login verification token")
    try:
        uuid.UUID(str(payload["sub"]))
        uuid.UUID(str(payload["verification_id"]))
    except (KeyError, ValueError):
        raise ValueError("Device login verification token is malformed") from None
    return payload


def create_card_action_token(*, user_id: str, token_version: int) -> str:
    """Create a short-lived proof that the transaction PIN was verified."""
    settings = get_settings()
    return jwt.encode(
        {
            "sub": user_id,
            "purpose": "card_create",
            "token_version": token_version,
            "jti": uuid.uuid4().hex,
            "exp": datetime.now(UTC) + timedelta(minutes=3),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_card_action_token(token: str, *, user_id: str, token_version: int) -> None:
    payload = decode_access_token(token)
    payload_version = payload.get("token_version")
    if (
        payload.get("purpose") != "card_create"
        or payload.get("sub") != user_id
        or type(payload_version) is not int
        or payload_version != token_version
    ):
        raise ValueError("Card action token is invalid")


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise


def create_google_phone_completion_token(
    *,
    google_subject: str,
    email: str,
    full_name: str,
    remember_me: bool,
    device_hash: str,
) -> str:
    """Create a short-lived, single-purpose proof for Google phone collection.

    The credential from Google is intentionally not stored or sent back to the
    browser. The signed proof contains only the verified profile claims needed
    to create/link the local account after the user enters their phone number.
    """
    settings = get_settings()
    return jwt.encode(
        {
            "purpose": "google_phone_completion",
            "google_subject": google_subject,
            "email": email,
            "full_name": full_name,
            "remember_me": remember_me,
            "device_hash": device_hash,
            "exp": datetime.now(UTC) + timedelta(minutes=10),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_google_phone_completion_token(token: str) -> dict[str, Any]:
    """Validate and return the verified Google profile carried by the proof."""
    payload = decode_access_token(token)
    required_strings = ("google_subject", "email", "full_name")
    if payload.get("purpose") != "google_phone_completion":
        raise ValueError("Invalid Google phone completion token")
    if any(not isinstance(payload.get(field), str) or not payload[field] for field in required_strings):
        raise ValueError("Google phone completion token is missing profile data")
    if not isinstance(payload.get("remember_me"), bool):
        raise ValueError("Google phone completion token is malformed")
    device_hash = payload.get("device_hash")
    if not isinstance(device_hash, str) or re.fullmatch(r"[0-9a-f]{64}", device_hash) is None:
        raise ValueError("Google phone completion token has an invalid device")
    return payload


def create_recipient_lookup_token(*, user_id: str, account_number: str, bank_code: str, account_name: str) -> str:
    """Create a short-lived proof that a recipient name came from internal lookup."""
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(seconds=settings.recipient_lookup_token_expire_seconds)
    return jwt.encode(
        {
            "sub": user_id,
            "purpose": "recipient_lookup",
            "account_number": account_number,
            "bank_code": bank_code,
            "account_name": account_name,
            "exp": expires_at,
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_recipient_lookup_token(token: str, *, user_id: str) -> dict[str, str]:
    """Validate lookup proof and ensure it belongs to the current user."""
    payload = decode_access_token(token)
    required_fields = ("account_number", "bank_code", "account_name")
    if payload.get("purpose") != "recipient_lookup" or payload.get("sub") != user_id:
        raise ValueError("Lookup token does not belong to this user")
    if any(not isinstance(payload.get(field), str) or not payload[field] for field in required_fields):
        raise ValueError("Lookup token is missing recipient data")
    return {field: payload[field] for field in required_fields}


def create_face_verification_token(
    *,
    user_id: str,
    transaction_id: str | None = None,
    nonce: str | None = None,
    amount: int | None = None,
) -> str:
    """A short-lived proof that the server completed face matching."""
    payload: dict[str, Any] = {
        "sub": user_id,
        "purpose": "face_verification",
        "exp": datetime.now(UTC) + timedelta(minutes=3),
    }
    if transaction_id:
        payload["transaction_id"] = transaction_id
    if nonce:
        payload["nonce"] = nonce
    if amount is not None:
        payload["amount"] = int(amount)
    settings = get_settings()
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_face_verification_token(
    token: str,
    *,
    user_id: str,
    transaction_id: str | None = None,
    nonce: str | None = None,
    amount: int | None = None,
) -> None:
    payload = decode_access_token(token)
    if payload.get("purpose") != "face_verification" or payload.get("sub") != user_id:
        raise ValueError("Face verification token does not belong to this user")
    if transaction_id is not None and payload.get("transaction_id") != transaction_id:
        raise ValueError("Face verification token does not belong to this transaction")
    if nonce is not None and payload.get("nonce") != nonce:
        raise ValueError("Face verification token does not match the current challenge")
    if amount is not None and int(payload.get("amount", -1)) != int(amount):
        raise ValueError("Face verification token does not match this transfer amount")


# Backward-compatible aliases for files that have not been mounted by app.main.
get_password_hash = hash_password
