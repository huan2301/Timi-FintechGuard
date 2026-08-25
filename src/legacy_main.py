import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.agents.graph import build_graph
from src.api.middleware import AuditMiddleware
from src.api.routes import router
from src.config import get_settings
from src.services.db import init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo tài nguyên 1 lần khi server start."""
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} in {settings.app_env} mode")

    # Tạo bảng DB nếu chưa có (dev/test). Production dùng alembic upgrade head.
    await init_db()
    logger.info("Database tables initialized.")

    # Build agent graph 1 lần duy nhất — không rebuild mỗi request
    app.state.agent = build_graph()
    logger.info("Agent graph compiled and ready.")

    yield

    logger.info("Shutting down...")


settings = get_settings()

app = FastAPI(
    title="AI20K Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — ưu tiên allowed_origins, fallback về cors_origins (legacy)
_origins_str = settings.allowed_origins or settings.cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins_str.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit Middleware — tự động log mọi request tới /api/v1/transactions/*
app.add_middleware(AuditMiddleware)

app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}
