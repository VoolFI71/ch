from common import Base, create_database_engines, make_get_db
from .config import get_settings

# Создаем движки и sessionmaker
sync_engine, async_engine, SessionLocal = create_database_engines(get_settings)

# Создаем функцию get_db для зависимостей FastAPI
get_db = make_get_db(SessionLocal)

# Экспортируем Base для моделей
__all__ = ["Base", "sync_engine", "async_engine", "SessionLocal", "get_db"]

