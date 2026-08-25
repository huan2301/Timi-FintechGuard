from unittest.mock import patch

import pytest

from src.app.api.auth import (
    _GOOGLE_CERTS_URL,
    _clear_google_certificate_cache,
    _GoogleCertificateCachingRequest,
    _verified_google_identity,
)
from src.app.config import get_settings
from src.app.core.security import (
    create_google_phone_completion_token,
    decode_google_phone_completion_token,
)
from src.app.schemas.auth import GooglePhoneCompletionRequest


def test_google_phone_completion_token_only_contains_verified_profile() -> None:
    token = create_google_phone_completion_token(
        google_subject="google-subject-123",
        email="person@example.com",
        full_name="Google Display Name",
        remember_me=True,
    )

    profile = decode_google_phone_completion_token(token)

    assert profile["google_subject"] == "google-subject-123"
    assert profile["email"] == "person@example.com"
    assert profile["full_name"] == "Google Display Name"
    assert profile["remember_me"] is True
    assert profile["purpose"] == "google_phone_completion"


def test_google_phone_completion_validates_timi_phone() -> None:
    payload = GooglePhoneCompletionRequest(
        phone_completion_token="x" * 20,
        phone="0901 234 567",
    )

    assert payload.phone == "0901234567"


def test_google_identity_uses_subject_and_google_display_name(monkeypatch) -> None:
    with monkeypatch.context() as context:
        context.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client.apps.googleusercontent.com")
        get_settings.cache_clear()
        with patch("google.oauth2.id_token.verify_oauth2_token") as verify_token:
            verify_token.return_value = {
                "iss": "https://accounts.google.com",
                "sub": "google-immutable-subject",
                "email": "google.user@example.com",
                "email_verified": True,
                "name": "Tên từ Google",
            }

            identity = _verified_google_identity("a" * 20)

        assert identity == (
            "google-immutable-subject",
            "google.user@example.com",
            "Tên từ Google",
        )
    get_settings.cache_clear()


def test_google_certificate_request_reuses_the_public_certificate_response() -> None:
    class Response:
        status = 200
        data = b'{"key-id": "certificate"}'
        headers = {"Cache-Control": "public, max-age=3600"}

    calls = 0

    def delegate(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return Response()

    _clear_google_certificate_cache()
    request = _GoogleCertificateCachingRequest(delegate)

    first = request(_GOOGLE_CERTS_URL)
    second = request(_GOOGLE_CERTS_URL)

    assert first.data == Response.data
    assert second.data == Response.data
    assert calls == 1
    assert request.used_cached_certificate
    _clear_google_certificate_cache()


@pytest.mark.asyncio
async def test_google_login_requires_server_configuration(client, monkeypatch) -> None:
    with monkeypatch.context() as context:
        # An empty process value overrides a developer's local .env value.
        context.setenv("GOOGLE_OAUTH_CLIENT_ID", "")
        get_settings.cache_clear()
        response = await client.post(
            "/api/v1/auth/google",
            json={"credential": "x" * 20},
        )

    get_settings.cache_clear()
    assert response.status_code == 503
    assert response.json()["detail"] == "Đăng nhập Google chưa được cấu hình"
