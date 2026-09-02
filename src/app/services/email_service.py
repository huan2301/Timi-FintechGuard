"""Transactional email delivery through Brevo's HTTPS API.

Env (.env):
  EMAIL_ENABLED=true
  EMAIL_PROVIDER=brevo_api
  BREVO_API_KEY=your_brevo_api_key
  EMAIL_FROM_ADDRESS=verified-sender@example.com
  EMAIL_FROM_NAME=Timi
"""

from __future__ import annotations

import html as html_lib
import json
import logging
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv

# load .env ở root project
_ROOT = Path(__file__).resolve().parents[3]  # chỉnh nếu path khác
load_dotenv(_ROOT / ".env")
# hoặc đơn giản:
load_dotenv()
logger = logging.getLogger(__name__)

BATCH_SIZE = 50  # gửi tuần tự, nghỉ nhẹ giữa các mail nếu cần
BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


def _masked_recipient(address: str) -> str:
    """Keep recipient PII out of application logs."""
    local, separator, domain = address.partition("@")
    if not separator:
        return "***"
    visible = local[:1] if local else ""
    return f"{visible}***@{domain}"


def _enabled() -> bool:
    return os.getenv("EMAIL_ENABLED", "false").lower() in {"1", "true", "yes"}


def _api_key() -> str:
    return (os.getenv("BREVO_API_KEY") or "").strip()


def _from_address() -> str:
    return (os.getenv("EMAIL_FROM_ADDRESS") or "").strip()


def _from_name() -> str:
    return (os.getenv("EMAIL_FROM_NAME") or "Timi").strip() or "Timi"


def _provider() -> str:
    """Return the provider name while preserving a clear config error path."""
    return (os.getenv("EMAIL_PROVIDER") or "brevo_api").strip().lower()


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
) -> bool:
    """Send one message through Brevo and return whether its API accepted it."""
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — not sending to %s", _masked_recipient(to))
        return False

    provider = _provider()
    if provider != "brevo_api":
        logger.error("Unsupported EMAIL_PROVIDER=%s; expected 'brevo_api'", provider)
        return False

    api_key = _api_key()
    from_address = _from_address()
    if not api_key or not from_address:
        logger.warning("BREVO_API_KEY / EMAIL_FROM_ADDRESS missing — cannot send")
        return False

    payload: dict[str, object] = {
        "sender": {"name": _from_name(), "email": from_address},
        "to": [{"email": to}],
        "subject": subject,
    }
    if html:
        payload["htmlContent"] = html
    elif text:
        payload["textContent"] = text
    else:
        logger.warning("Email content is empty — cannot send to %s", _masked_recipient(to))
        return False
    request = Request(
        BREVO_SEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-key": api_key,
            "User-Agent": "timi-antiscam/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            response_body = json.loads(response.read().decode("utf-8"))
        logger.info(
            "Brevo API delivery accepted for %s id=%s",
            _masked_recipient(to),
            response_body.get("messageId", "unknown"),
        )
        return True
    except HTTPError as error:
        provider_code = "unknown"
        try:
            provider_error = json.loads(error.read().decode("utf-8"))
            provider_code = str(provider_error.get("code", "unknown"))
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        logger.error(
            "Brevo API delivery failed for %s status=%s code=%s",
            _masked_recipient(to),
            error.code,
            provider_code,
        )
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as error:
        logger.error("Brevo API delivery failed for %s: %s", _masked_recipient(to), error)
    return False


def send_batch_emails(
    *,
    items: list[dict],
) -> tuple[int, int]:
    """
    Gửi nhiều email tuần tự qua Brevo API.

    items: [{ "to", "subject", "html", "text"? }, ...]
    Returns: (success_count, fail_count)
    """
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — skip batch (%d)", len(items))
        return 0, len(items)

    if not items:
        return 0, 0

    ok = fail = 0
    for i in range(0, len(items), BATCH_SIZE):
        chunk = items[i : i + BATCH_SIZE]
        for it in chunk:
            success = send_email(
                to=it["to"],
                subject=it["subject"],
                html=it["html"],
                text=it.get("text"),
            )
            if success:
                ok += 1
            else:
                fail += 1
        logger.info(
            "Brevo API batch chunk %d–%d done",
            i + 1,
            i + len(chunk),
        )

    return ok, fail


def send_transaction_email(
    *,
    to: str,
    full_name: str,
    amount: int,
    counterparty: str,
    direction: str,
    status: str,
) -> bool:
    safe_name = html_lib.escape(full_name)
    safe_counterparty = html_lib.escape(counterparty)
    safe_status = html_lib.escape(status)
    amount_str = f"{amount:,}".replace(",", ".") + " đ"
    title = "Giao dịch thành công" if status == "completed" else f"Cập nhật giao dịch ({status})"
    action = "đã chuyển đến" if direction == "out" else "đã nhận từ"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Banking</h2>
      <p>Xin chào <b>{safe_name}</b>,</p>
      <p>Bạn {action} <b>{safe_counterparty}</b> số tiền <b>{amount_str}</b>.</p>
      <p>Trạng thái: <b>{safe_status}</b></p>
      <hr/>
      <p style="color:#64748b;font-size:12px">
        Email thông báo từ Timi. Nếu không phải bạn, hãy kiểm tra bảo mật tài khoản.
      </p>
    </div>
    """
    return send_email(to=to, subject=f"[Timi] {title}", html=html)


def send_security_email(
    *,
    to: str,
    full_name: str,
    title: str,
    message: str,
) -> bool:
    safe_name = html_lib.escape(full_name)
    safe_title = html_lib.escape(title)
    safe_message = html_lib.escape(message)
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Security</h2>
      <p>Xin chào <b>{safe_name}</b>,</p>
      <p><b>{safe_title}</b></p>
      <p>{safe_message}</p>
      <hr/>
      <p style="color:#64748b;font-size:12px">
        Nếu không phải bạn thao tác, hãy đổi mật khẩu / PIN ngay.
      </p>
    </div>
    """
    return send_email(to=to, subject=f"[Timi] {title}", html=html)


def wrap_broadcast_html(*, body_html: str, preheader: str = "") -> str:
    safe_preheader = html_lib.escape(preheader)
    return f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:linear-gradient(135deg,#7c3aed,#d946ef);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:20px">Timi</h1>
        <p style="margin:6px 0 0;color:#f5e9ff;font-size:12px">AI Financial Guardian</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        {f'<p style="display:none">{safe_preheader}</p>' if safe_preheader else ""}
        {body_html}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#64748b;font-size:12px;margin:0">
          Bạn nhận email vì đã đăng ký tài khoản Timi.
          Có thể tắt thông báo cập nhật trong phần Tài khoản.
        </p>
      </div>
    </div>
    """
