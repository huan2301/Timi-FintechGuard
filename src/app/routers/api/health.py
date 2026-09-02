"""Health check — dùng cho Docker healthcheck và uptime monitor."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.app.config import get_settings
from src.app.db.session import get_db

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness: process còn sống. Không chạm DB nên luôn nhanh."""
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.app_env,
    }


@router.get("/health/ready")
def readiness(db: Session = Depends(get_db)) -> dict[str, str]:
    """Readiness: kiểm tra cả kết nối Postgres và extension pgvector."""
    db.execute(text("SELECT 1"))
    has_vector = db.scalar(text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"))
    return {
        "status": "ready",
        "database": "connected",
        "pgvector": "enabled" if has_vector else "missing",
    }
