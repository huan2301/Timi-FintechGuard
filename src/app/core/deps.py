"""Dependencies for authenticated and administrator-only API routes."""

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.app.core.security import JWTError, decode_access_token
from src.app.db.session import get_db
from src.app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token không hợp lệ hoặc đã hết hạn",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass(frozen=True, slots=True)
class PendingLogin:
    user: User
    claims: dict[str, Any]


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _CREDENTIALS_ERROR

    try:
        payload = decode_access_token(credentials.credentials)
        # Only plain access tokens authenticate API calls. Short-lived proofs
        # for recipient lookup, face verification, or pending login location
        # must never be accepted as a user session.
        if payload.get("purpose") is not None:
            raise ValueError("Purpose-bound tokens cannot authenticate requests")
        user_id = uuid.UUID(payload["sub"])
        token_version = payload.get("token_version")
        if type(token_version) is not int or payload.get("location_confirmed") is not True:
            raise ValueError("Access token claims are incomplete")
    except (JWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None or not user.is_active or token_version != user.auth_token_version:
        raise _CREDENTIALS_ERROR
    return user


def get_pending_login(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> PendingLogin:
    """Authenticate only the short-lived token used for location confirmation."""
    if credentials is None:
        raise _CREDENTIALS_ERROR
    try:
        payload = decode_access_token(credentials.credentials)
        if payload.get("purpose") != "login_location":
            raise ValueError("Not a pending login token")
        user_id = uuid.UUID(payload["sub"])
        token_version = payload.get("token_version")
        device_hash = payload.get("device_hash")
        if (
            type(token_version) is not int
            or not isinstance(payload.get("remember_me"), bool)
            or not isinstance(device_hash, str)
            or len(device_hash) != 64
        ):
            raise ValueError("Pending login claims are incomplete")
    except (JWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None or not user.is_active or token_version != user.auth_token_version:
        raise _CREDENTIALS_ERROR
    return PendingLogin(user=user, claims=payload)


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ admin mới có quyền truy cập",
        )
    return current_user
