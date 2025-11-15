from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db
from .routers import auth_router


settings = get_settings()

app = FastAPI(title=settings.app_name)

configure_observability(app, settings=settings, get_db=get_db)

app.include_router(auth_router)
