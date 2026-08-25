"""Compatibility exports for legacy imports.

All database configuration lives in :mod:`app.config` and :mod:`app.db.session`.
Keeping this module prevents older files from silently opening a second engine or
using credentials embedded in source code.
"""

from src.app.db.base import Base
from src.app.db.session import SessionLocal, engine, get_db

__all__ = ["Base", "SessionLocal", "engine", "get_db"]
