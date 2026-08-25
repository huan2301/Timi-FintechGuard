"""Cấu hình tập trung, đọc từ biến môi trường / file .env."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Resolve from this checkout, not from whichever directory starts Uvicorn.
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "FIN-19 Anti-Scam Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Danh sách origin cho CORS, phân tách bằng dấu phẩy.
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ---- Database ----
    database_url: str = "postgresql+psycopg2://antiscam:antiscam@localhost:5432/antiscam"
    database_schema: str = Field(default="public", pattern=r"^[A-Za-z_][A-Za-z0-9_]*$")

    # Schema được quản lý bằng Alembic / file SQL, không tự tạo khi app khởi động.
    db_auto_create: bool = False

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    # ---- Auth ----
    # Bắt buộc override ở production, xem validate_production_secrets().
    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=1)
    remember_me_expire_days: int = Field(default=30, ge=1, le=90)
    history_cursor_secret: str = ""
    # Web OAuth client ID created in Google Cloud Console. This is an audience
    # identifier (not a secret) and must match VITE_GOOGLE_CLIENT_ID at build time.
    google_oauth_client_id: str = ""

    # ---- Cloudinary media storage ----
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ---- LLM ----
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    # Timi's in-app assistant uses Groq through its OpenAI-compatible endpoint.
    # Keep it separate so the optional transaction-explanation integration can
    # continue using its own provider configuration.
    groq_api_key: str = ""
    groq_model_name: str = "openai/gpt-oss-20b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Each specialist can use an independent provider account, quota, base URL
    # and model. Empty values preserve compatibility by falling back to GROQ_*.
    chat_agent_api_key: str = ""
    # Ordered comma-separated backup keys. Used only after a provider HTTP 429.
    chat_agent_api_keys: str = ""
    chat_agent_base_url: str = ""
    chat_agent_model: str = ""
    # Context-aware fallback for natural-language page-navigation requests.
    # It is constrained to the browser route allowlist in task_navigation.py.
    task_navigator_agent_enabled: bool = True
    task_navigator_agent_api_key: str = ""
    task_navigator_agent_api_keys: str = ""
    task_navigator_agent_base_url: str = ""
    task_navigator_agent_model: str = ""
    task_navigator_agent_max_completion_tokens: int = Field(default=120, ge=32, le=256)
    # Chat data is isolated by the authenticated user id.  The cache version
    # lets an operator invalidate old answers after a prompt/model update.
    assistant_chat_history_limit: int = Field(default=40, ge=1, le=100)
    assistant_chat_context_exchanges: int = Field(default=3, ge=0, le=10)
    assistant_chat_retention_days: int = Field(default=90, ge=1, le=365)
    # gpt-oss uses part of this allowance for internal reasoning, so 320 can
    # cut a normal Vietnamese support answer in the middle of a bullet.
    assistant_chat_max_completion_tokens: int = Field(default=640, ge=128, le=1500)
    # Bump after expanding scope/RAG so stale out-of-scope answers are never
    # replayed for questions that are now supported.
    assistant_chat_cache_version: str = Field(default="v3", min_length=1, max_length=32)
    # Agent-owned Scam Guardian decisions. The backend validates the bounded
    # JSON contract and executes only the returned safety action.
    guardian_agent_enabled: bool = True
    guardian_agent_api_key: str = ""
    # Ordered comma-separated backup keys. Used only after a provider HTTP 429.
    guardian_agent_api_keys: str = ""
    guardian_agent_base_url: str = ""
    guardian_agent_model: str = "llama-3.1-8b-instant"
    # GPT-OSS can spend more internal reasoning for difficult, ambiguous calls.
    # Keep low for realtime latency; use medium when accuracy is the priority.
    guardian_agent_reasoning_effort: Literal["low", "medium", "high"] = "low"
    # Avoid spending a provider request on every short STT fragment.
    guardian_agent_min_interval_seconds: float = Field(default=6.0, ge=0.0, le=60.0)
    # Realtime Guardian fallback STT. Uses Groq Whisper when configured.
    guardian_stt_enabled: bool = True
    guardian_stt_api_key: str = ""
    # Ordered comma-separated backup keys. Used only after a provider HTTP 429.
    guardian_stt_api_keys: str = ""
    guardian_stt_base_url: str = ""
    # Prefer the accuracy-oriented Whisper model for short Vietnamese call
    # segments; override with whisper-large-v3-turbo when latency/cost wins.
    guardian_stt_model: str = "whisper-large-v3"
    llm_temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    llm_explanation_enabled: bool = False

    # ---- Vector store (pgvector, dùng chung DB với Postgres) ----
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = Field(default=1536, ge=1)
    # Public-content RAG. Indexing is explicit; retrieval fails open to the
    # normal Chat Support path when embeddings/provider are unavailable.
    rag_enabled: bool = True
    rag_top_k: int = Field(default=4, ge=1, le=8)
    rag_min_similarity: float = Field(default=0.18, ge=0.0, le=1.0)
    rag_chunk_size: int = Field(default=900, ge=300, le=2000)
    rag_chunk_overlap: int = Field(default=120, ge=0, le=400)

    # ---- Recipient lookup ----
    # Token proves that a recipient name came from the internal directory.
    recipient_lookup_token_expire_seconds: int = Field(default=300, ge=30, le=900)

    # Separate HMAC secret for pseudonymizing transaction device/network data.
    # It must be configured separately from JWT_SECRET_KEY in production.
    risk_telemetry_hash_key: str = ""

    # ---- Local Face ID: capture quality, passive liveness, and matching ----
    face_model_preload: bool = False
    # Production images ship verified models; do not fetch executable model
    # files from the network during a user request unless explicitly enabled.
    face_model_allow_download: bool = True
    face_model_dir: str = str(PROJECT_ROOT / "models" / "face")
    # Changes whenever preprocessing/model changes, so old embeddings are re-enrolled.
    face_model_id: str = "opencv-sface-yunet"
    face_embedding_version: str = "opencv-sface-face-crop-v1"
    face_similarity_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    face_transaction_similarity_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    # Passive anti-spoofing runs locally on the backend. The checksum pins the
    # model artifact so a replaced ONNX file cannot silently become trusted.
    face_liveness_model_path: str = str(PROJECT_ROOT / "models" / "face" / "minifasnet_v2.onnx")
    face_liveness_model_sha256: str = "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b"
    face_liveness_model_id: str = "minifasnet-v2-2.7-80x80"
    # The upstream MiniFASNet ensemble combines V2 (2.7x crop) and V1SE
    # (4.0x crop). Averaging their predictions is less brittle under ordinary
    # webcam lighting, glasses, and browser compression than V2 alone.
    face_liveness_v1se_model_path: str = str(PROJECT_ROOT / "models" / "face" / "minifasnet_v1se.onnx")
    face_liveness_v1se_model_sha256: str = "a25886a85cdcfa2c4ea23edb71de35f250c17827b4cadd253a972b28c80fdf1e"
    # MiniFASNet is a three-class classifier whose upstream decision is argmax
    # (label 1 = real). 0.36 is only an ambiguity floor; the real score must
    # still beat both spoof-class scores on a majority of distinct frames.
    face_liveness_live_threshold: float = Field(default=0.36, ge=0.34, le=0.99)
    # The web client collects a short adaptive burst. This is deliberately not
    # an 8–15-frame hard requirement; three distinct samples are sufficient for
    # the local model and replay/duplicate checks used by this demo.
    face_liveness_min_frames: int = Field(default=3, ge=2, le=6)
    face_liveness_max_frames: int = Field(default=6, ge=2, le=10)
    face_transaction_failure_limit: int = Field(default=5, ge=1)
    face_transaction_lock_seconds: int = Field(default=30, ge=1)

    @computed_field
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def validate_production_secrets(self) -> None:
        """Chặn khởi động production với secret mặc định."""
        if self.app_env == "production" and self.jwt_secret_key.startswith("dev-only"):
            raise RuntimeError(
                "JWT_SECRET_KEY vẫn là giá trị mặc định. "
                "Đặt một secret ngẫu nhiên trước khi chạy production."
            )
        if self.app_env == "production" and not self.risk_telemetry_hash_key:
            raise RuntimeError(
                "RISK_TELEMETRY_HASH_KEY chưa được cấu hình. "
                "Đặt một secret ngẫu nhiên riêng cho dữ liệu telemetry."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
