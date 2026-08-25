"""Database package exports that do not create a connection at import time."""

from src.app.db.base import Base

__all__ = ["Base"]
