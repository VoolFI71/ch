from fastapi import Depends, FastAPI
from fastapi import Response
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .routers import enrollments_router


settings = get_settings()

app = FastAPI(title=settings.app_name)

instrumentator = Instrumentator().instrument(app) if settings.metrics_enabled else None


@app.get("/healthz")
def healthz(db: Session = Depends(get_db)) -> JSONResponse:
	return JSONResponse({"status": "ok"})


@app.get("/metrics")
def metrics() -> Response:
	if not settings.metrics_enabled:
		return JSONResponse({"detail": "Metrics disabled"}, status_code=404)
	content = generate_latest()
	return Response(content=content, media_type=CONTENT_TYPE_LATEST)


app.include_router(enrollments_router)
