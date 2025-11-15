from fastapi import FastAPI

from common.observability import configure_observability

from .config import get_settings
from .database import get_db
from .routers import games_router, games_ws_router


settings = get_settings()

app = FastAPI(title=settings.app_name)

configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={},
)

app.include_router(games_router)
app.include_router(games_ws_router)

