"""Email delivery via SMTP (Gmail / Auto mail).

Env (.env):
  EMAIL_ENABLED=true
  EMAIL_PROVIDER=gmail_api         # gmail_api or smtp
  EMAIL_HOST=smtp.gmail.com
  EMAIL_PORT=587
  EMAIL_USER=your@gmail.com
  EMAIL_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (16 ký tự)
  EMAIL_FROM=Timi <your@gmail.com>     # nên trùng EMAIL_USER với Gmail
"""

from __future__ import annotations

import base64
import json
import logging
import os
import smtplib
import ssl
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# load .env ở root project
_ROOT = Path(__file__).resolve().parents[3]  # chỉnh nếu path khác
load_dotenv(_ROOT / ".env")
# hoặc đơn giản:
load_dotenv()
logger = logging.getLogger(__name__)

BATCH_SIZE = 50  # gửi tuần tự, nghỉ nhẹ giữa các mail nếu cần


def _enabled() -> bool:
    return os.getenv("EMAIL_ENABLED", "false").lower() in {"1", "true", "yes"}


def _host() -> str:
    return (os.getenv("EMAIL_HOST") or "smtp.gmail.com").strip()


def _port() -> int:
    try:
        return int(os.getenv("EMAIL_PORT") or "587")
    except ValueError:
        return 587


def _user() -> str:
    return (os.getenv("EMAIL_USER") or "").strip()


def _password() -> str:
    # Gmail app password thường có dấu cách — bỏ khoảng trắng cho chắc
    return (os.getenv("EMAIL_PASSWORD") or "").replace(" ", "").strip()


def _from_address() -> str:
    raw = (os.getenv("EMAIL_FROM") or "").strip()
    if raw:
        return raw
    user = _user()
    return f"Timi <{user}>" if user else "Timi <noreply@localhost>"


def _provider() -> str:
    """Return the configured provider; Gmail API is the safe default."""
    return (os.getenv("EMAIL_PROVIDER") or "gmail_api").strip().lower()


def _gmail_api_credentials() -> tuple[str, str, str]:
    return (
        (os.getenv("GMAIL_CLIENT_ID") or "").strip(),
        (os.getenv("GMAIL_CLIENT_SECRET") or "").strip(),
        (os.getenv("GMAIL_REFRESH_TOKEN") or "").strip(),
    )


def _build_message(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str],
) -> tuple[MIMEMultipart, str]:
    from_name, from_addr = _parse_from(_from_address())
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to
    msg.attach(MIMEText(text or "Xem phiên bản HTML của email này.", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    return msg, from_addr


def _send_via_gmail_api(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str],
) -> bool:
    """Send through Gmail's HTTPS API, including on Render Free."""
    client_id, client_secret, refresh_token = _gmail_api_credentials()
    if not all((client_id, client_secret, refresh_token)):
        logger.error(
            "EMAIL_PROVIDER=gmail_api requires GMAIL_CLIENT_ID, "
            "GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN"
        )
        return False

    try:
        token_request = Request(
            "https://oauth2.googleapis.com/token",
            data=urlencode(
                {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urlopen(token_request, timeout=30) as response:
            access_token = json.loads(response.read().decode("utf-8"))["access_token"]

        message, _ = _build_message(to=to, subject=subject, html=html, text=text)
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        send_request = Request(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            data=json.dumps({"raw": raw_message}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "User-Agent": "timi-antiscam/1.0",
            },
            method="POST",
        )
        with urlopen(send_request, timeout=30) as response:
            response_body = json.loads(response.read().decode("utf-8"))
        logger.info("Gmail API OK to %s subject=%s id=%s", to, subject, response_body.get("id"))
        return True
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        logger.error("Gmail API failed to %s status=%s body=%s", to, error.code, body)
    except (URLError, TimeoutError, OSError, KeyError, ValueError, json.JSONDecodeError) as error:
        logger.error("Gmail API failed to %s: %s", to, error)
    return False


def _parse_from(from_header: str) -> tuple[str, str]:
    name, addr = parseaddr(from_header)
    if not addr:
        addr = _user()
    return name or "Timi", addr


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Gửi 1 email qua SMTP. True khi gửi thành công."""
    if not _enabled():
        logger.warning("EMAIL_ENABLED=false — NOT sending to %s", to)
        return False

    provider = _provider()
    if provider == "gmail_api":
        return _send_via_gmail_api(to=to, subject=subject, html=html, text=text)
    if provider != "smtp":
        logger.error(
            "Unsupported EMAIL_PROVIDER=%s; expected 'gmail_api' or 'smtp'",
            provider,
        )
        return False

    user = _user()
    password = _password()
    if not user or not password:
        logger.warning("EMAIL_USER / EMAIL_PASSWORD missing — cannot send")
        print("SMTP ERROR: thiếu EMAIL_USER hoặc EMAIL_PASSWORD trong .env")
        return False

    from_name, from_addr = _parse_from(_from_address())
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to

    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    # Plain fallback nếu không có text
    else:
        msg.attach(MIMEText("Xem phiên bản HTML của email này.", "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    host = _host()
    port = _port()

    try:
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
                server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())
        else:
            # 587 STARTTLS (Gmail mặc định)
            with smtplib.SMTP(host, port, timeout=30) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())

        logger.info("SMTP OK to %s subject=%s", to, subject)
        print(f"SMTP OK → {to}")
        return True
    except Exception as e:
        logger.exception("SMTP failed to %s", to)
        print("SMTP ERROR:", type(e).__name__, e)
        return False


def send_batch_emails(
    *,
    items: list[dict],
) -> tuple[int, int]:
    """
    Gửi nhiều email tuần tự qua SMTP.

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
            "SMTP batch chunk %d–%d done",
            i + 1,
            i + len(chunk),
        )

    print(f"SMTP BATCH RESULT: ok={ok} fail={fail} total={len(items)}")
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
    amount_str = f"{amount:,}".replace(",", ".") + " đ"
    title = (
        "Giao dịch thành công"
        if status == "completed"
        else f"Cập nhật giao dịch ({status})"
    )
    action = "đã chuyển đến" if direction == "out" else "đã nhận từ"
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Banking</h2>
      <p>Xin chào <b>{full_name}</b>,</p>
      <p>Bạn {action} <b>{counterparty}</b> số tiền <b>{amount_str}</b>.</p>
      <p>Trạng thái: <b>{status}</b></p>
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
    html = f"""
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#7c3aed">Timi Security</h2>
      <p>Xin chào <b>{full_name}</b>,</p>
      <p><b>{title}</b></p>
      <p>{message}</p>
      <hr/>
      <p style="color:#64748b;font-size:12px">
        Nếu không phải bạn thao tác, hãy đổi mật khẩu / PIN ngay.
      </p>
    </div>
    """
    return send_email(to=to, subject=f"[Timi] {title}", html=html)


def wrap_broadcast_html(*, body_html: str, preheader: str = "") -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <div style="background:linear-gradient(135deg,#7c3aed,#d946ef);padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="margin:0;color:#fff;font-size:20px">Timi</h1>
        <p style="margin:6px 0 0;color:#f5e9ff;font-size:12px">AI Financial Guardian</p>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
        {f'<p style="display:none">{preheader}</p>' if preheader else ""}
        {body_html}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#64748b;font-size:12px;margin:0">
          Bạn nhận email vì đã đăng ký tài khoản Timi.
          Có thể tắt thông báo cập nhật trong phần Tài khoản.
        </p>
      </div>
    </div>
    """
