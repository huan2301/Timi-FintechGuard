"""Compatibility exports for the historic ``src.app.api`` import path.

The maintained HTTP implementation lives under ``src.app.routers.api``.
Keeping this small facade prevents older tests and integrations from breaking
while the router package remains the single source of truth.
"""
