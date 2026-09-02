"""Run the repository's golden suites in contract-validation mode.

The product-specific behavioral runners can be added per suite later. This
runner intentionally reports what is actually verified today: JSONL contract
validity and case counts, without claiming a model prediction was executed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "eval" / "golden"
sys.path.insert(0, str(ROOT))

from eval.runners.validate_schema import validate_file  # noqa: E402

SUITES = ("transaction", "guardian", "seasonal", "url_safety", "security_login")


def load_cases(suite: str) -> list[dict]:
    path = GOLDEN / suite / "cases.jsonl"
    errors = validate_file(path)
    if errors:
        raise ValueError("; ".join(errors))
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def run(suites: list[str]) -> int:
    total = 0
    for suite in suites:
        cases = load_cases(suite)
        total += len(cases)
        print(f"OK {suite}: {len(cases)} contract cases")
    print(f"Validated {total} golden contract cases")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=SUITES, action="append")
    args = parser.parse_args()
    try:
        return run(args.suite or list(SUITES))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
