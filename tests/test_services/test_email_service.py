import json

from src.app.services import email_service


class FakeResponse:
    def __init__(self, payload: dict[str, str]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_email_provider_defaults_to_brevo_api(monkeypatch) -> None:
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)

    assert email_service._provider() == "brevo_api"


def test_brevo_api_sends_transactional_email_over_https(monkeypatch) -> None:
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("EMAIL_PROVIDER", "brevo_api")
    monkeypatch.setenv("BREVO_API_KEY", "test-api-key")
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "verified@example.com")
    monkeypatch.setenv("EMAIL_FROM_NAME", "Timi")
    requests = []

    def fake_urlopen(request, timeout: int):
        requests.append((request, timeout))
        return FakeResponse({"messageId": "brevo-message-id"})

    monkeypatch.setattr(email_service, "urlopen", fake_urlopen)

    assert email_service.send_email(
        to="recipient@gmail.com",
        subject="Verification code",
        html="<p>123456</p>",
        text="123456",
    )
    assert len(requests) == 1
    request, timeout = requests[0]
    assert request.full_url == "https://api.brevo.com/v3/smtp/email"
    assert request.method == "POST"
    assert timeout == 30
    assert request.get_header("Api-key") == "test-api-key"
    payload = json.loads(request.data.decode("utf-8"))
    assert payload == {
        "sender": {"name": "Timi", "email": "verified@example.com"},
        "to": [{"email": "recipient@gmail.com"}],
        "subject": "Verification code",
        "htmlContent": "<p>123456</p>",
    }


def test_brevo_api_missing_credentials_fails_closed(monkeypatch) -> None:
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("EMAIL_PROVIDER", "brevo_api")
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.setenv("EMAIL_FROM_ADDRESS", "verified@example.com")

    assert not email_service.send_email(
        to="recipient@example.com",
        subject="Verification code",
        html="<p>123456</p>",
    )


def test_unsupported_email_provider_fails_closed(monkeypatch) -> None:
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("EMAIL_PROVIDER", "smtp")

    assert not email_service.send_email(
        to="recipient@example.com",
        subject="Verification code",
        html="<p>123456</p>",
    )
