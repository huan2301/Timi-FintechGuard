import base64
import json
from email import policy
from email.parser import BytesParser

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


def test_email_provider_defaults_to_gmail_api(monkeypatch) -> None:
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)

    assert email_service._provider() == "gmail_api"


def test_gmail_api_provider_refreshes_token_and_sends_mime_message(
    monkeypatch,
) -> None:
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    monkeypatch.setenv("EMAIL_PROVIDER", "gmail_api")
    monkeypatch.setenv("EMAIL_USER", "sender@example.com")
    monkeypatch.setenv("EMAIL_FROM", "Timi <sender@example.com>")
    monkeypatch.setenv("GMAIL_CLIENT_ID", "client-id")
    monkeypatch.setenv("GMAIL_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GMAIL_REFRESH_TOKEN", "refresh-token")

    requests = []

    def fake_urlopen(request, timeout: int):
        requests.append((request, timeout))
        if request.full_url.endswith("/token"):
            return FakeResponse({"access_token": "access-token"})
        return FakeResponse({"id": "gmail-message-id"})

    monkeypatch.setattr(email_service, "urlopen", fake_urlopen)

    assert email_service.send_email(
        to="recipient@example.com",
        subject="Verification code",
        html="<p>123456</p>",
        text="123456",
    )
    assert len(requests) == 2

    token_request, _ = requests[0]
    assert token_request.full_url == "https://oauth2.googleapis.com/token"
    assert b"grant_type=refresh_token" in token_request.data

    send_request, _ = requests[1]
    assert send_request.full_url.endswith("/gmail/v1/users/me/messages/send")
    assert send_request.get_header("Authorization") == "Bearer access-token"
    raw_message = json.loads(send_request.data.decode("utf-8"))["raw"]
    decoded_message = base64.urlsafe_b64decode(raw_message + "===")
    assert b"To: recipient@example.com" in decoded_message
    parsed_message = BytesParser(policy=policy.default).parsebytes(decoded_message)
    assert parsed_message.get_body(preferencelist=("plain",)).get_content().strip() == "123456"
