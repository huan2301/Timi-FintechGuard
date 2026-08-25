"""Run manual evaluation cases against a running FintechGuard API.

Usage:
  python scripts/eval_manual.py

The script never writes the email, password, bearer token, or lookup token to
the evidence files.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path


API_URL = os.getenv("EVAL_API_URL", "http://localhost:8000/api").rstrip("/")
RESULTS_DIR = Path(__file__).resolve().parents[1] / "eval" / "results"


CASES = {
    "case-01-safe": {"account_env": "EVAL_RECIPIENT_1", "amount": 50_000, "note": "Thanh toan test"},
    "case-02-unusual-amount": {"account_env": "EVAL_RECIPIENT_2", "amount": 10_000_000, "note": "Thanh toan test"},
    "case-03-scam-note": {"account_env": "EVAL_RECIPIENT_3", "amount": 500_000, "note": "phi mo khoa chuyen gap giu bi mat"},
    "case-04-blacklist": {"account_env": "EVAL_BLACKLIST_ACCOUNT", "bank_env": "EVAL_BLACKLIST_BANK_CODE", "amount": 500_000, "note": "Thanh toan test"},
    "case-05-trusted-recipient": {"account_env": "EVAL_TRUSTED_ACCOUNT", "amount": 500_000, "note": "Thanh toan test"},
    "case-06-high-value-face": {"account_env": "EVAL_RECIPIENT_1", "amount": 10_000_001, "note": "Chuyen khoan gia tri cao"},
}


def request_json(method: str, path: str, body: dict, token: str | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"{API_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(detail)
        except json.JSONDecodeError:
            return exc.code, {"detail": detail}


def main() -> int:
    global API_URL
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", choices=[*CASES, "all"], default="all")
    parser.add_argument("--api-url", default=API_URL)
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--recipient", default="0047938706")
    parser.add_argument("--bank-code", default="VCB")
    parser.add_argument("--blacklist-account", default="6520090604")
    parser.add_argument("--blacklist-bank", default="MB")
    args = parser.parse_args()
    API_URL = args.api_url.rstrip("/")

    email = args.email or os.getenv("EVAL_EMAIL") or input("Email test: ").strip()
    password = args.password or os.getenv("EVAL_PASSWORD") or getpass.getpass("Mật khẩu: ")
    if not email or not password:
        raise SystemExit("Thiếu email hoặc mật khẩu.")

    status, login = request_json("POST", "/v1/auth/login", {"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"Đăng nhập thất bại ({status}): {login}")
    token = login["access_token"]

    selected = CASES if args.case == "all" else {args.case: CASES[args.case]}
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    for case_id, case in selected.items():
        if case_id == "case-04-blacklist":
            account = args.blacklist_account
            bank_code = args.blacklist_bank
        else:
            account = args.recipient
            bank_code = args.bank_code
        if not account:
            print(f"SKIP {case_id}: thiếu tài khoản người nhận")
            continue

        lookup_status, lookup = request_json(
            "POST",
            "/v1/recipients/resolve",
            {
                "account_number": account,
                "bank_code": bank_code,
            },
            token,
        )
        if lookup_status != 200:
            print(f"FAIL {case_id}: resolve ({lookup_status}) {lookup}")
            continue

        started = time.perf_counter()
        assess_status, result = request_json(
            "POST",
            "/v1/transactions/assess",
            {
                "payee_account": account,
                "bank_code": lookup["bank_code"],
                "recipient_lookup_token": lookup["verification_token"],
                "amount": case["amount"],
                "note": case["note"],
                "currency": "VND",
                "client_context": {
                    "device_id": "eval-python-device-0001",
                    "geo_latitude": 21.0285,
                    "geo_longitude": 105.8542,
                    "geo_accuracy_m": 50,
                },
            },
            token,
        )
        latency_ms = round((time.perf_counter() - started) * 1000)
        evidence = {
            "case_id": case_id,
            "captured_at": datetime.now(UTC).isoformat(),
            "http_status": assess_status,
            "latency_ms": latency_ms,
            "risk_level": result.get("risk_level"),
            "risk_score": result.get("risk_score"),
            "signals": result.get("signals", []),
            "requires_face_verification": result.get("requires_face_verification", False),
            "llm_used": None,
            "llm_used_note": "Not exposed by the assess response; verify in backend logs if required.",
            "decision": "require_user_decision" if result.get("requires_user_decision") else "continue",
            "response": result,
        }
        output = RESULTS_DIR / f"{case_id}.jsonl"
        # JSONL keeps one complete evidence record on one line, which is easy
        # to append, stream, and import into evaluation tools.
        output.write_text(json.dumps(evidence, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"OK   {case_id}: {output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
