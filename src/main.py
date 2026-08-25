"""Production backend entrypoint.

The application code lives under ``src.app`` so Docker, local development and
the frontend use one canonical backend package.
"""

from src.app.main import app

__all__ = ["app"]

