"""Send an explicit email-provider smoke test to operator-supplied recipients."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send a Timi email smoke test using the configured provider.",
    )
    parser.add_argument(
        "--recipient",
        action="append",
        required=True,
        help="Recipient address. Repeat the flag to test batch delivery.",
    )
    args = parser.parse_args()

    load_dotenv(PROJECT_ROOT / ".env")
    from src.app.services.email_service import send_batch_emails

    items = [
        {
            "to": recipient,
            "subject": "[Timi] Kiểm tra nhà cung cấp email",
            "html": "<p>Đây là email kiểm tra do quản trị viên chủ động gửi.</p>",
            "text": "Đây là email kiểm tra do quản trị viên chủ động gửi.",
        }
        for recipient in args.recipient
    ]
    successful, failed = send_batch_emails(items=items)
    print(f"Kết quả: thành công={successful}, thất bại={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
