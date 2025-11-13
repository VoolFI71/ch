import httpx
from fastapi import FastAPI
from sqlalchemy.orm import Session

from common import configure_observability

from .config import get_settings
from .database import get_db
from .routers import courses_router


settings = get_settings()

app = FastAPI(title=settings.app_name)


async def _check_enrollments(_: Session) -> None:
	if not settings.enrollments_service_url:
		return
	url = settings.enrollments_service_url.rstrip("/") + "/healthz"
	headers: dict[str, str] = {}
	if settings.enrollments_internal_token:
		headers["X-Internal-Token"] = settings.enrollments_internal_token
	async with httpx.AsyncClient(timeout=2.0) as client:
		response = await client.get(url, headers=headers)
		response.raise_for_status()


configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={"enrollments_service": _check_enrollments},
)

app.include_router(courses_router)
