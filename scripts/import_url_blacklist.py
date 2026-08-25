"""Import URL or domain lists into the active Postgres blacklist.

Usage:
    .\\.venv\\Scripts\\python.exe scripts/import_url_blacklist.py file1.txt file2.csv

Supported files are .txt (one URL/domain per line), .csv, and .json. Entries
are deduplicated by normalized hostname so every path on a known malicious
host is blocked by QR scanning.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

# ``python scripts/import_url_blacklist.py`` puts ``scripts`` rather than the
# repository root first on sys.path.  Add the project root so this utility is
# equally reliable when launched from PowerShell or an IDE task.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select

from src.app.db.session import SessionLocal
from src.app.models.blacklist import Blacklist
from src.app.services.url_blacklist import normalize_url_host


URL_FIELD_NAMES = {"url", "link", "domain", "host", "website", "website_url"}


def _strings_from_json(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _strings_from_json(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in URL_FIELD_NAMES:
                yield from _strings_from_json(item)
            elif isinstance(item, (list, dict)):
                yield from _strings_from_json(item)


def read_candidates(path: Path) -> Iterable[str]:
    suffix = path.suffix.lower()
    if suffix == ".txt":
        for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            value = line.strip()
            if value and not value.startswith("#"):
                yield value
        return

    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            if not reader.fieldnames:
                return
            fields = [field for field in reader.fieldnames if field and field.lower().strip() in URL_FIELD_NAMES]
            # Prefer an explicit URL column. Files that also contain a domain
            # column would otherwise process every row twice.
            url_field = next((field for field in fields if field.lower().strip() in {"url", "link", "website_url"}), None)
            fields = [url_field] if url_field else fields
            for row in reader:
                for field in fields:
                    value = (row.get(field) or "").strip()
                    if value:
                        yield value
        return

    if suffix == ".json":
        yield from _strings_from_json(json.loads(path.read_text(encoding="utf-8-sig")))
        return

    raise ValueError(f"Không hỗ trợ định dạng {suffix or 'không có đuôi file'}: {path}")


def import_file(db, path: Path) -> tuple[int, int, int]:
    invalid = duplicates = 0
    hosts: dict[str, str] = {}
    for raw_value in read_candidates(path):
        host = normalize_url_host(raw_value)
        if host is None:
            invalid += 1
            continue
        if host in hosts:
            duplicates += 1
            continue
        hosts[host] = raw_value

    existing_hosts: set[str] = set()
    host_values = list(hosts)
    # Avoid one database round-trip for every domain in a large feed.
    for start in range(0, len(host_values), 500):
        chunk = host_values[start:start + 500]
        existing_hosts.update(db.scalars(
            select(Blacklist.entity_value).where(
                Blacklist.entity_type == "url",
                Blacklist.entity_value.in_(chunk),
                Blacklist.is_active.is_(True),
            )
        ).all())

    inserted = 0
    for host, raw_value in hosts.items():
        if host in existing_hosts:
            continue
        db.add(
            Blacklist(
                entity_type="url",
                entity_value=host,
                source=f"url-file:{path.name}",
                risk_score=1.0,
                evidence={
                    "original_url": raw_value,
                    "source_file": path.name,
                    "match_scope": "hostname",
                },
                is_active=True,
            )
        )
        inserted += 1
    return inserted, duplicates + len(existing_hosts), invalid


def main() -> int:
    parser = argparse.ArgumentParser(description="Import URL blacklist files into Postgres")
    parser.add_argument("files", nargs="+", type=Path, help=".txt, .csv, or .json URL-list files")
    args = parser.parse_args()

    for path in args.files:
        if not path.is_file():
            parser.error(f"Không tìm thấy file: {path}")

    with SessionLocal() as db:
        try:
            totals = [0, 0, 0]
            for path in args.files:
                result = import_file(db, path)
                totals = [total + count for total, count in zip(totals, result)]
                print(f"{path.name}: inserted {result[0]}, skipped {result[1]}, invalid {result[2]}")
            db.commit()
        except Exception:
            db.rollback()
            raise

    print(f"Total: inserted {totals[0]}, skipped {totals[1]}, invalid {totals[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
