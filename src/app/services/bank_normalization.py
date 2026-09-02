"""Canonical bank identifiers for exact blacklist matching.

The blacklist spreadsheet contains both abbreviations (``VCB``) and display
names (``Vietcombank``). Normalizing both sides preserves the required exact
account-plus-bank match without treating different banks as equivalent.
"""

from __future__ import annotations

import re
import unicodedata

_ALIASES = {
    "VCB": "VCB",
    "VIETCOMBANK": "VCB",
    "NGAN HANG NGOAI THUONG VIET NAM": "VCB",
    "TCB": "TCB",
    "TECHCOMBANK": "TCB",
    "MBB": "MBB",
    "MB": "MBB",
    "MB BANK": "MBB",
    "MBBANK": "MBB",
    "MILITARY BANK": "MBB",
    "MB MILITARY BANK": "MBB",
    "ACB": "ACB",
    "NGAN HANG A CHAU": "ACB",
    "VPB": "VPB",
    "VPBANK": "VPB",
    "BIDV": "BIDV",
    "TPB": "TPB",
    "TPBANK": "TPB",
    "VIB": "VIB",
    "VIB BANK": "VIB",
    "VIETINBANK": "CTG",
    "CTG": "CTG",
    "AGRIBANK": "AGRIBANK",
    "SACOMBANK": "STB",
    "STB": "STB",
}


def normalize_bank_name(value: str | None) -> str | None:
    if not value:
        return None
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    normalized = re.sub(r"[^A-Z0-9]+", " ", ascii_value.upper()).strip()
    if not normalized or normalized in {"KHONG RO", "N A"}:
        return None
    return _ALIASES.get(normalized, normalized)
