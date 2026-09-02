import hashlib
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

import bcrypt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from src.app.config import Settings
from src.app.core.deps import PendingLogin, get_current_user, get_pending_login
from src.app.core.policies import DEVICE_LOGIN_RESEND_COOLDOWN, TRUSTED_LOGIN_DEVICE_TTL
from src.app.core.security import (
    create_access_token,
    create_card_action_token,
    create_device_login_verification_token,
    create_login_location_token,
    decode_access_token,
    decode_card_action_token,
    decode_device_login_verification_token,
    hash_password,
    verify_password,
)
from src.app.models.device_login_verification import DeviceLoginVerification
from src.app.models.user import User, UserRole
from src.app.routers.api.auth import (
    _login_response_for_device,
    _record_login_context,
    record_login_location,
    resend_login_device_code,
    verify_login_device,
)
from src.app.schemas.auth import DeviceLoginOtpRequest, DeviceLoginResendRequest, LoginLocationRequest
from src.app.services.notifications import add_in_app_notification
from src.app.services.transaction_telemetry import device_hash_from_id
from src.app.services.verification_secrets import hash_verification_code, verification_code_matches


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _user(*, token_version: int = 0):
    return SimpleNamespace(id=uuid4(), is_active=True, auth_token_version=token_version)


def _login_user(
    *,
    token_version: int = 0,
    device_hash: str | None = None,
    trusted_until: datetime | None = None,
) -> User:
    return User(
        id=uuid4(),
        email="session-owner@example.com",
        full_name="Session Owner",
        phone="0901234567",
        avatar_url=None,
        hashed_password=hash_password("Password-123!"),
        role=UserRole.USER.value,
        is_active=True,
        balance=1_000_000,
        timi_bank_enabled=True,
        auth_token_version=token_version,
        last_login_device_hash=device_hash,
        trusted_device_until=trusted_until,
        created_at=datetime.now(UTC),
    )


def test_password_hash_uses_the_complete_utf8_password_and_reads_legacy_hashes() -> None:
    first = "A1!" + "x" * 90 + "first"
    second = "A1!" + "x" * 90 + "second"
    password_hash = hash_password(first)

    assert password_hash.startswith("bcrypt-sha256$")
    assert verify_password(first, password_hash)
    assert not verify_password(second, password_hash)

    legacy = bcrypt.hashpw(b"Legacy-Password1!", bcrypt.gensalt()).decode("utf-8")
    assert verify_password("Legacy-Password1!", legacy)
    assert not verify_password("wrong", "not-a-valid-hash")


def test_purpose_bound_and_unconfirmed_tokens_cannot_authenticate_api_calls() -> None:
    user = _user(token_version=4)
    db = Mock()
    db.get.return_value = user
    pending = create_login_location_token(
        user_id=str(user.id),
        role="user",
        token_version=4,
        remember_me=False,
        device_hash="a" * 64,
    )
    unconfirmed = create_access_token(
        str(user.id),
        "user",
        token_version=4,
        location_confirmed=False,
    )

    with pytest.raises(HTTPException) as pending_error:
        get_current_user(_credentials(pending), db)
    assert pending_error.value.status_code == 401

    with pytest.raises(HTTPException) as location_error:
        get_current_user(_credentials(unconfirmed), db)
    assert location_error.value.status_code == 401


def test_pending_location_exchange_and_token_version_revocation_are_enforced() -> None:
    user = _user(token_version=2)
    db = Mock()
    db.get.return_value = user
    pending = create_login_location_token(
        user_id=str(user.id),
        role="user",
        token_version=2,
        remember_me=True,
        device_hash="b" * 64,
    )
    pending_login = get_pending_login(_credentials(pending), db)
    assert pending_login.user is user
    assert pending_login.claims["remember_me"] is True
    assert pending_login.claims["device_hash"] == "b" * 64

    access = create_access_token(str(user.id), "user", token_version=2)
    assert get_current_user(_credentials(access), db) is user
    user.auth_token_version = 3
    with pytest.raises(HTTPException) as revoked:
        get_current_user(_credentials(access), db)
    assert revoked.value.status_code == 401


def test_device_challenge_token_and_hash_are_purpose_bound() -> None:
    user_id = uuid4()
    verification_id = uuid4()
    device_hash = device_hash_from_id("test-browser-device-0001")
    token = create_device_login_verification_token(
        user_id=str(user_id),
        verification_id=str(verification_id),
        token_version=9,
    )

    claims = decode_device_login_verification_token(token)

    assert claims["sub"] == str(user_id)
    assert claims["verification_id"] == str(verification_id)
    assert claims["token_version"] == 9
    assert device_hash == device_hash_from_id("test-browser-device-0001")
    assert device_hash != "test-browser-device-0001"


def test_new_device_login_sends_email_without_revoking_the_existing_session() -> None:
    user = _login_user(token_version=3, device_hash="a" * 64)
    db = Mock()
    db.scalar.return_value = None

    def assign_device_verification_id(row: object) -> None:
        if isinstance(row, DeviceLoginVerification) and row.id is None:
            row.id = uuid4()

    db.add.side_effect = assign_device_verification_id
    new_device_hash = "b" * 64
    with (
        patch("src.app.routers.api.auth.send_email", return_value=True) as send_email,
        patch("src.app.routers.api.auth.add_in_app_notification") as notify_old_device,
    ):
        response = _login_response_for_device(
            db,
            user=user,
            device_hash=new_device_hash,
            remember_me=True,
        )

    assert response.device_verification_required is True
    assert response.email == user.email
    assert user.auth_token_version == 3
    send_email.assert_called_once()
    notify_old_device.assert_called_once()
    assert notify_old_device.call_args.kwargs["mandatory"] is True
    challenge = decode_device_login_verification_token(response.verification_token)
    assert challenge["sub"] == str(user.id)
    assert challenge["token_version"] == 3


def test_resend_device_otp_rotates_the_code_after_cooldown() -> None:
    user = _login_user(token_version=3, device_hash="a" * 64)
    now = datetime.now(UTC)
    record = DeviceLoginVerification(
        id=uuid4(),
        user_id=user.id,
        device_hash="b" * 64,
        otp_hash=hash_verification_code("123456"),
        token_version=3,
        remember_me=True,
        expires_at=now + timedelta(minutes=5),
        created_at=now - DEVICE_LOGIN_RESEND_COOLDOWN - timedelta(seconds=1),
        attempts=2,
    )
    proof = create_device_login_verification_token(
        user_id=str(user.id),
        verification_id=str(record.id),
        token_version=3,
    )
    db = Mock()
    db.scalar.side_effect = [user, record]

    with (
        patch("src.app.routers.api.auth.secrets.randbelow", return_value=654321),
        patch("src.app.routers.api.auth.send_email", return_value=True) as send_email,
        patch("src.app.routers.api.auth.add_audit_log") as audit,
    ):
        response = resend_login_device_code(
            DeviceLoginResendRequest(verification_token=proof),
            db,
        )

    assert response.resend_available_in_seconds == int(DEVICE_LOGIN_RESEND_COOLDOWN.total_seconds())
    assert verification_code_matches("654321", record.otp_hash)
    assert not verification_code_matches("123456", record.otp_hash)
    assert record.attempts == 0
    assert record.expires_at > now + timedelta(minutes=9)
    send_email.assert_called_once()
    assert audit.call_args.kwargs["action"] == "auth.device_verification_resent"
    db.commit.assert_called_once()


def test_resend_device_otp_enforces_server_cooldown() -> None:
    user = _login_user(token_version=3, device_hash="a" * 64)
    now = datetime.now(UTC)
    record = DeviceLoginVerification(
        id=uuid4(),
        user_id=user.id,
        device_hash="b" * 64,
        otp_hash=hash_verification_code("123456"),
        token_version=3,
        remember_me=True,
        expires_at=now + timedelta(minutes=5),
        created_at=now - timedelta(seconds=5),
        attempts=0,
    )
    proof = create_device_login_verification_token(
        user_id=str(user.id),
        verification_id=str(record.id),
        token_version=3,
    )
    db = Mock()
    db.scalar.side_effect = [user, record]

    with patch("src.app.routers.api.auth.send_email") as send_email:
        with pytest.raises(HTTPException) as throttled:
            resend_login_device_code(
                DeviceLoginResendRequest(verification_token=proof),
                db,
            )

    assert throttled.value.status_code == 429
    assert int(throttled.value.headers["Retry-After"]) > 0
    send_email.assert_not_called()


def test_trusted_device_skips_otp_and_location_for_30_days() -> None:
    device_hash = "a" * 64
    user = _login_user(
        token_version=5,
        device_hash=device_hash,
        trusted_until=datetime.now(UTC) + timedelta(days=29),
    )
    db = Mock()

    response = _login_response_for_device(
        db,
        user=user,
        device_hash=device_hash,
        remember_me=False,
    )

    claims = decode_access_token(response.access_token)
    assert response.location_confirmation_required is False
    assert claims["location_confirmed"] is True
    assert "purpose" not in claims
    db.scalar.assert_not_called()


def test_expired_trusted_device_requires_location_but_not_device_otp() -> None:
    device_hash = "a" * 64
    user = _login_user(
        token_version=5,
        device_hash=device_hash,
        trusted_until=datetime.now(UTC) - timedelta(seconds=1),
    )
    db = Mock()

    response = _login_response_for_device(
        db,
        user=user,
        device_hash=device_hash,
        remember_me=False,
    )

    claims = decode_access_token(response.access_token)
    assert response.location_confirmation_required is True
    assert claims["purpose"] == "login_location"
    assert claims["device_hash"] == device_hash
    db.scalar.assert_not_called()


def test_correct_device_otp_issues_only_a_device_bound_pending_location_token() -> None:
    user = _login_user(token_version=4, device_hash="a" * 64)
    record = DeviceLoginVerification(
        id=uuid4(),
        user_id=user.id,
        device_hash="b" * 64,
        otp_hash=hash_verification_code("123456"),
        token_version=4,
        remember_me=True,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        created_at=datetime.now(UTC),
        attempts=0,
    )
    proof = create_device_login_verification_token(
        user_id=str(user.id),
        verification_id=str(record.id),
        token_version=4,
    )
    db = Mock()
    db.scalar.side_effect = [user, record]

    response = verify_login_device(
        DeviceLoginOtpRequest(verification_token=proof, otp="123456"),
        db,
    )

    claims = decode_access_token(response.access_token)
    assert response.location_confirmation_required is True
    assert claims["purpose"] == "login_location"
    assert claims["device_hash"] == "b" * 64
    assert user.auth_token_version == 4
    db.delete.assert_called_once_with(record)


def test_location_activation_rotates_version_and_revokes_the_old_device() -> None:
    user = _login_user(token_version=7, device_hash="a" * 64)
    old_access = create_access_token(str(user.id), user.role, token_version=7)
    pending = PendingLogin(
        user=user,
        claims={
            "token_version": 7,
            "remember_me": False,
            "device_hash": "b" * 64,
        },
    )
    payload = LoginLocationRequest(
        client_context={
            "device_id": "test-browser-device-0002",
            "geo_latitude": 10.7769,
            "geo_longitude": 106.7009,
            "geo_accuracy_m": 500,
        }
    )
    db = Mock()
    db.scalar.return_value = user
    before_confirmation = datetime.now(UTC)
    with patch("src.app.routers.api.auth._record_login_context", return_value=[]):
        response = record_login_location(payload, Mock(), db, pending)

    assert user.auth_token_version == 8
    assert user.last_login_device_hash == "b" * 64
    assert user.last_login_location_confirmed_at >= before_confirmation
    assert user.trusted_device_until - user.last_login_location_confirmed_at == TRUSTED_LOGIN_DEVICE_TTL
    assert decode_access_token(response.access_token)["token_version"] == 8

    auth_db = Mock()
    auth_db.get.return_value = user
    with pytest.raises(HTTPException) as revoked:
        get_current_user(_credentials(old_access), auth_db)
    assert revoked.value.status_code == 401
    assert get_current_user(_credentials(response.access_token), auth_db) is user


def test_location_exchange_rejects_a_different_browser_id() -> None:
    user = _login_user(token_version=2, device_hash="a" * 64)
    payload = LoginLocationRequest(
        client_context={
            "device_id": "test-browser-device-0003",
            "geo_latitude": 10.7769,
            "geo_longitude": 106.7009,
            "geo_accuracy_m": 500,
        }
    )

    with pytest.raises(HTTPException) as mismatch:
        _record_login_context(
            Mock(),
            user=user,
            payload=payload,
            request=SimpleNamespace(client=None),
            expected_device_hash="f" * 64,
        )

    assert mismatch.value.status_code == 401


def test_card_action_proof_is_bound_to_user_and_token_version() -> None:
    user_id = str(uuid4())
    proof = create_card_action_token(user_id=user_id, token_version=7)

    decode_card_action_token(proof, user_id=user_id, token_version=7)
    with pytest.raises(ValueError):
        decode_card_action_token(proof, user_id=str(uuid4()), token_version=7)
    with pytest.raises(ValueError):
        decode_card_action_token(proof, user_id=user_id, token_version=8)


def test_verification_codes_use_keyed_digests_with_short_legacy_compatibility() -> None:
    code = "123456"
    digest = hash_verification_code(code)

    assert digest != hashlib.sha256(code.encode("utf-8")).hexdigest()
    assert verification_code_matches(code, digest)
    assert not verification_code_matches("654321", digest)
    assert verification_code_matches(code, hashlib.sha256(code.encode("utf-8")).hexdigest())


def test_notification_preferences_are_enforced_when_staging_notifications() -> None:
    user_id = uuid4()
    db = Mock()
    db.get.return_value = SimpleNamespace(
        transaction_enabled=False,
        security_enabled=True,
        promotion_enabled=False,
    )

    assert not add_in_app_notification(
        db,
        user_id=user_id,
        title="Giao dịch",
        body="Không được tạo",
        kind="transaction",
    )
    assert add_in_app_notification(
        db,
        user_id=user_id,
        title="Bảo mật",
        body="Được tạo",
        kind="security",
    )
    db.add.assert_called_once()


def test_critical_security_notification_cannot_be_disabled() -> None:
    user_id = uuid4()
    db = Mock()
    db.get.return_value = SimpleNamespace(
        transaction_enabled=False,
        security_enabled=False,
        promotion_enabled=False,
    )

    assert add_in_app_notification(
        db,
        user_id=user_id,
        title="Thiết bị mới",
        body="Cần cảnh báo phiên đang đăng nhập",
        kind="security",
        mandatory=True,
    )
    db.add.assert_called_once()


def test_production_configuration_rejects_placeholders_and_cross_key_reuse() -> None:
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        Settings(
            app_env="production",
            jwt_secret_key="replace_with_a_long_random_secret",
        ).validate_production_secrets()

    shared = "a" * 48
    with pytest.raises(RuntimeError, match="RISK_TELEMETRY_HASH_KEY"):
        Settings(
            app_env="production",
            jwt_secret_key=shared,
            risk_telemetry_hash_key=shared,
            card_encryption_key="b" * 48,
            cors_origins="https://app.example.test",
        ).validate_production_secrets()

    with pytest.raises(RuntimeError, match="EMAIL_ENABLED"):
        Settings(
            app_env="production",
            jwt_secret_key="a" * 48,
            risk_telemetry_hash_key="b" * 48,
            card_encryption_key="c" * 48,
            email_enabled=False,
            cors_origins="https://app.example.test",
        ).validate_production_secrets()

    Settings(
        app_env="production",
        jwt_secret_key="a" * 48,
        risk_telemetry_hash_key="b" * 48,
        card_encryption_key="c" * 48,
        email_enabled=True,
        email_provider="brevo_api",
        brevo_api_key="test-api-key",
        email_from_address="verified@example.test",
        email_from_name="Timi",
        cors_origins="https://app.example.test",
    ).validate_production_secrets()


def test_fixed_backend_policies_are_not_environment_settings() -> None:
    removed_fields = {
        "external_transfer_mode",
        "daily_transfer_limit_vnd",
        "device_login_otp_expire_minutes",
        "device_login_otp_resend_seconds",
        "device_login_otp_attempt_limit",
    }

    assert removed_fields.isdisjoint(Settings.model_fields)
