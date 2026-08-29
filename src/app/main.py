import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.app.routers.api import (
    newsletter,
    agents,
    assistant,
    content,
    auth,
    guardian,
    health,
    password_reset,
    recipients,
    support,
    transactions,
    url_safety,
    legacy_compat,
)
from src.app.routers.api.admin import emails as admin_emails, routes as admin
from src.app.config import get_settings
from src.app.services.face_verification import warm_face_model
from src.app.services.passive_liveness import warm_passive_liveness_model

settings = get_settings()
settings.validate_production_secrets()

app = FastAPI(title="FintechGuard API", version="2.0.0")
media_directory = settings.project_root / "data" / "uploads"
media_directory.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_directory), name="media")


@app.middleware("http")
async def add_browser_security_headers(request, call_next):
    """Keep OAuth popup communication compatible in the single-service deploy."""
    response = await call_next(request)
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
    response.headers.setdefault("Referrer-Policy", "no-referrer-when-downgrade")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin_emails.router, prefix="/api/v1")
app.include_router(support.router, prefix="/api/v1")
app.include_router(newsletter.router, prefix="/api/v1")
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(recipients.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(url_safety.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(assistant.router, prefix="/api/v1")
app.include_router(content.router, prefix="/api/v1")
app.include_router(guardian.router, prefix="/api/v1")
app.include_router(admin_emails.notifications_router, prefix="/api/v1")
app.include_router(password_reset.router, prefix="/api/v1")
app.include_router(legacy_compat.router, prefix="/api/v1")

frontend_directory = settings.project_root / "frontend" / "dist"
frontend_index = frontend_directory / "index.html"


def frontend_response(path: str = ""):
    """Return a built asset or the SPA shell for a client-side route."""
    if not frontend_index.is_file():
        raise HTTPException(status_code=404, detail="Not Found")

    requested_file = (frontend_directory / path).resolve()
    if (
        requested_file.is_file()
        and frontend_directory.resolve() in requested_file.parents
    ):
        return FileResponse(requested_file)
    return FileResponse(frontend_index)


@app.get("/", include_in_schema=False)
async def frontend_root():
    if not frontend_index.is_file():
        return {"message": "FintechGuard API is running", "docs": "/docs"}
    return frontend_response()


@app.get("/{path:path}", include_in_schema=False)
async def frontend_fallback(path: str):
    # Preserve useful 404s for unknown backend endpoints instead of returning
    # index.html to an API client.
    if path.startswith(("api/", "media/")):
        raise HTTPException(status_code=404, detail="Not Found")
    return frontend_response(path)


@app.on_event("startup")
def preload_face_ai() -> None:
    """Warm Face ID when the deployment explicitly ships/preloads the models."""
    if not settings.face_model_preload:
        return
    try:
        warm_face_model()
        warm_passive_liveness_model()
    except Exception:
        logging.getLogger(__name__).warning("Face AI warm-up failed; it will retry on first verification.")
