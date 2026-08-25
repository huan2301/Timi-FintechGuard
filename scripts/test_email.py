import sys
from pathlib import Path
from dotenv import load_dotenv
import os

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from src.app.services.email_service import send_email, send_batch_emails

print("EMAIL_ENABLED =", os.getenv("EMAIL_ENABLED"))
print("EMAIL_USER =", os.getenv("EMAIL_USER"))
print("HAS_PASSWORD =", bool(os.getenv("EMAIL_PASSWORD")))
print("FROM =", os.getenv("EMAIL_FROM"))
print("HOST =", os.getenv("EMAIL_HOST"), "PORT =", os.getenv("EMAIL_PORT"))

RECIPIENTS = [
    "kemii1704@gmail.com",
    "ngovan.15121977@gmail.com",
]

for to in RECIPIENTS:
    ok = send_email(
        to=to,
        subject="[Timi] Test SMTP",
        html=f"<p>Test SMTP tới <b>{to}</b></p>",
    )
    print(f"single → {to}: {ok}")

items = [
    {
        "to": "kemii1704@gmail.com",
        "subject": "[Timi] Batch SMTP #1",
        "html": "<p>Batch SMTP cho kemii1704</p>",
    },
    {
        "to": "ngovan.15121977@gmail.com",
        "subject": "[Timi] Batch SMTP #2",
        "html": "<p>Batch SMTP cho ngovan</p>",
    },
]
ok, fail = send_batch_emails(items=items)
print(f"batch result: ok={ok} fail={fail}")