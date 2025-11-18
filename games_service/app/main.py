from pathlib import Path

from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import games_router, games_ws_router


settings = get_settings()

app = FastAPI(title=settings.app_name)

MIGRATIONS_PATH = Path(__file__).resolve().parent / "migrations" / "versions"


def apply_sql_migrations() -> None:
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


configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={},
)

app.include_router(games_router)
app.include_router(games_ws_router)

