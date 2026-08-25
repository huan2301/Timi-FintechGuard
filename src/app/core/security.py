"""Password hashing and JWT helpers shared by all active API routers."""

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from src.app.config import get_settings


def hash_password(password: str) -> str:
    """Hash passwords safely while respecting bcrypt's 72-byte limit."""
    return bcrypt.hashpw(
        password.encode("utf-8")[:72], bcrypt.gensalt()
    ).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8")
    )


def create_access_token(
    subject: str | dict[str, Any], role: str | None = None, expires_delta: timedelta | None = None
) -> str:
    """Create a signed JWT.

    ``dict`` input is accepted temporarily for compatibility with unmounted
    legacy routers. New code passes a subject UUID and role explicitly.
    """
    settings = get_settings()
    payload = dict(subject) if isinstance(subject, dict) else {"sub": subject}
    if role is not None:
        payload["role"] = role
    expires_at = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload["exp"] = expires_at
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise


def create_google_phone_completion_token(
    *, google_subject: str, email: str, full_name: str, remember_me: bool
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
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
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
    return payload


def create_recipient_lookup_token(
    *, user_id: str, account_number: str, bank_code: str, account_name: str
) -> str:
    """Create a short-lived proof that a recipient name came from internal lookup."""
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=settings.recipient_lookup_token_expire_seconds
    )
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
        "exp": datetime.now(timezone.utc) + timedelta(minutes=3),
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
