"""Canonical URL-host matching for the QR safety blacklist."""

from __future__ import annotations

from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.app.models.blacklist import Blacklist


def normalize_url_host(value: str) -> str | None:
    """Return a stable hostname for an HTTP(S) URL or a bare domain.

    Blacklist records store hosts rather than complete URLs. That prevents a
    malicious site from bypassing an exact URL block by changing its path,
    query string, or scheme.
    """
    candidate = value.strip()
    if not candidate or len(candidate) > 4_096 or any(character.isspace() for character in candidate):
        return None
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"
    elif "://" not in candidate:
        # Do not turn a non-web scheme such as ``javascript:`` or ``mailto:``
        # into a fake hostname by prepending https://.  Bare hostnames do not
        # have a URL scheme, while malformed scheme-like values do.
        if urlsplit(candidate).scheme:
            return None
        candidate = f"https://{candidate}"

    try:
        parsed = urlsplit(candidate)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return None
        host = parsed.hostname.rstrip(".").lower()
        # Compare unicode domains with the ASCII representation a browser uses.
        host = host.encode("idna").decode("ascii")
    except (UnicodeError, ValueError):
        return None

    return host.removeprefix("www.") or None


def find_active_url_blacklist_match(db: Session, raw_url: str) -> tuple[str | None, Blacklist | None]:
    """Find an active URL blacklist entry by its normalized host."""
    host = normalize_url_host(raw_url)
    if host is None:
        return None, None

    entry = db.scalar(
        select(Blacklist).where(
            Blacklist.entity_type == "url",
            Blacklist.entity_value == host,
            Blacklist.is_active.is_(True),
        )
    )
    return host, entry
