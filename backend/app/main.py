from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi import Response
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .migrations_runner import run_migrations
from .routers import auth_router
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest


settings = get_settings()

app = FastAPI(title=settings.app_name)

# Prometheus metrics
instrumentator = Instrumentator().instrument(app) if settings.metrics_enabled else None



@app.on_event("startup")
def on_startup() -> None:
    # Run Alembic migrations to ensure DB schema is up-to-date
    run_migrations()
    # Nothing else required for metrics; route is defined explicitly below


@app.get("/healthz")
def healthz(db: Session = Depends(get_db)) -> JSONResponse:
    # touching the db session ensures connection pool is initialized
    return JSONResponse({"status": "ok"})


# Metrics endpoint (explicit to avoid being shadowed by catch-all route)
@app.get("/metrics")
def metrics() -> Response:
    if not settings.metrics_enabled:
        return JSONResponse({"detail": "Metrics disabled"}, status_code=404)
    content = generate_latest()
    return Response(content=content, media_type=CONTENT_TYPE_LATEST)


# API routes
app.include_router(auth_router)


# Frontend serving
WEB_DIR = Path(settings.web_dir).resolve()


def _resolve_web_path(request_path: str) -> Path | None:
    # Normalize and prevent path traversal
    safe_path = Path(request_path.lstrip("/"))
    candidate = (WEB_DIR / safe_path).resolve()
    try:
        candidate.relative_to(WEB_DIR)
    except ValueError:
        return None

    if candidate.is_file():
        return candidate

    # try with .html when path is like /course
    html_candidate = candidate.with_suffix(".html")
    if html_candidate.is_file():
        return html_candidate

    # root -> index.html
    if request_path in ("", "/"):
        index = WEB_DIR / "index.html"
        if index.is_file():
            return index

    return None


@app.get("/course/{course_id}")
def serve_course_by_id(course_id: int):
    # Always serve course.html for pretty URL, frontend reads courseId from path
    course_file = WEB_DIR / "course.html"
    if not course_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    # Inject no special headers; course.js will parse window.location.pathname
    return FileResponse(str(course_file))

@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    resolved = _resolve_web_path(full_path)
    if resolved is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return FileResponse(str(resolved))


