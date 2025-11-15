from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from common.observability import configure_observability

from .config import get_settings
from .database import get_db
from .routers import auth_router


settings = get_settings()

app = FastAPI(title=settings.app_name)


async def _check_auth_service(_: Session) -> None:
    if not settings.auth_service_url:
        return
    url = settings.auth_service_url.rstrip("/") + "/healthz"
    async with httpx.AsyncClient(timeout=2.0) as client:
        response = await client.get(url)
        response.raise_for_status()


configure_observability(
    app,
    settings=settings,
    get_db=get_db,
    extra_checks={"auth_service": _check_auth_service},
)


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


@app.get("/games")
@app.get("/games/")
def serve_games_page():
    games_file = WEB_DIR / "games.html"
    if not games_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return FileResponse(str(games_file))


@app.get("/match/{match_id}")
def serve_match_page(match_id: str):
    match_file = WEB_DIR / "match.html"
    if not match_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return FileResponse(str(match_file))


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    resolved = _resolve_web_path(full_path)
    if resolved is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return FileResponse(str(resolved))
