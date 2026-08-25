"""Build the public-content RAG index from published admin content.

Usage:
    python scripts/index_public_content.py
    python scripts/index_public_content.py --page privacy help
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Running ``python scripts/index_public_content.py`` puts ``scripts/`` (not
# the repository root) on sys.path. Add the root so the canonical ``src``
# package can be imported without requiring PYTHONPATH configuration.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.app.db.session import SessionLocal  # noqa: E402
from src.app.services.public_content_rag import (  # noqa: E402
    PUBLIC_PAGE_KEYS,
    reindex_public_content,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Index published Timi public content for RAG")
    parser.add_argument(
        "--page",
        nargs="*",
        choices=sorted(PUBLIC_PAGE_KEYS),
        help="Only index selected public pages; default is all pages.",
    )
    args = parser.parse_args()
    with SessionLocal() as db:
        count = reindex_public_content(db, page_keys=args.page or None)
    print(f"Indexed {count} public content chunks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
