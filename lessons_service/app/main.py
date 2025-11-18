import httpx
import time
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import inspect

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import lessons_router, pgn_files_router


settings = get_settings()

app = FastAPI(title=settings.app_name)

MIGRATIONS_PATH = Path(__file__).resolve().parent / "migrations" / "versions"


def _wait_for_tables(tables: tuple[str, ...], timeout: float = 60.0) -> None:
	if not tables:
		return
	deadline = time.time() + timeout
	while time.time() < deadline:
		inspector = inspect(sync_engine)
		if all(inspector.has_table(name) for name in tables):
			return
		time.sleep(1)


def apply_sql_migrations() -> None:
	_wait_for_tables(("courses",))
	if not MIGRATIONS_PATH.is_dir():
		return

	for sql_file in sorted(MIGRATIONS_PATH.glob("*.sql")):
		sql = sql_file.read_text(encoding="utf-8").strip()
		if not sql:
			continue
		with sync_engine.begin() as conn:
			conn.exec_driver_sql(sql)


@app.on_event("startup")
def run_startup_tasks() -> None:
	apply_sql_migrations()


async def _check_enrollments(_: object) -> None:
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

app.include_router(lessons_router)
app.include_router(pgn_files_router)
