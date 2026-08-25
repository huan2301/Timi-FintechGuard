"""Validate golden JSONL: JSON parse + required fields."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "eval" / "golden"
REQUIRED = {"id", "suite", "version", "priority", "input", "expected"}
EXP_REQUIRED = {"risk_level", "min_score", "max_score", "must_signals", "must_not_signals"}


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists() or path.stat().st_size == 0:
        return [f"{path}: empty or missing"]
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}:{i}: invalid JSON ({e})")
            continue
        missing = REQUIRED - obj.keys()
        if missing:
            errors.append(f"{path.name}:{i}: missing {missing}")
            continue
        exp = obj.get("expected") or {}
        missing_e = EXP_REQUIRED - exp.keys()
        if missing_e:
            errors.append(f"{path.name}:{i} id={obj.get('id')}: expected missing {missing_e}")
        if exp.get("min_score", 0) > exp.get("max_score", 100):
            errors.append(f"{path.name}:{i} id={obj.get('id')}: min_score > max_score")
    return errors


def main() -> int:
    suites = [
        "transaction/cases.jsonl",
        "guardian/cases.jsonl",
        "seasonal/cases.jsonl",
        "url_safety/cases.jsonl",
        "security_login/cases.jsonl",
    ]
    all_err: list[str] = []
    for rel in suites:
        p = GOLDEN / rel
        if not p.exists():
            all_err.append(f"{rel}: missing required suite")
            continue
        if p.stat().st_size == 0:
            all_err.append(f"{rel}: empty required suite")
            continue
        err = validate_file(p)
        if err:
            all_err.extend(err)
        else:
            n = sum(1 for L in p.read_text(encoding="utf-8").splitlines() if L.strip() and not L.strip().startswith("#"))
            print(f"OK {rel} ({n} cases)")
    if all_err:
        print("FAILED:")
        for e in all_err:
            print(" ", e)
        return 1
    print("All required suites OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
