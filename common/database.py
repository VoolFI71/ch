"""Общий модуль для работы с базой данных во всех сервисах."""
from collections.abc import AsyncIterator
from typing import Callable

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
	"""Базовый класс для всех моделей SQLAlchemy."""
	pass


def resolve_async_url(database_url: str, database_url_async: str | None) -> str:
	"""
	Преобразует синхронный URL базы данных в асинхронный.
	
	Args:
		database_url: Синхронный URL базы данных
		database_url_async: Опциональный асинхронный URL (если задан, используется он)
	
	Returns:
		Асинхронный URL базы данных
	
	Raises:
		ValueError: Если не удалось определить async URL
	"""
	if database_url_async:
		return database_url_async
	if "+asyncpg" in database_url:
		return database_url
	replacements = [
		("+psycopg2", "+asyncpg"),
		("+psycopg", "+asyncpg"),
		("postgresql://", "postgresql+asyncpg://"),
		("postgres://", "postgresql+asyncpg://"),
	]
	for needle, replacement in replacements:
		if needle in database_url:
			return database_url.replace(needle, replacement, 1)
	raise ValueError(
		"Не удалось определить async URL: задайте database_url_async или используйте PostgreSQL"
	)


def create_database_engines(
	get_settings: Callable,
) -> tuple[type[create_engine], type[create_async_engine], type[async_sessionmaker]]:
	"""
	Создает синхронный и асинхронный движки базы данных, а также sessionmaker.
	
	Args:
		get_settings: Функция для получения настроек (должна возвращать объект с атрибутами:
			database_url, database_url_async, db_pool_size, db_max_overflow,
			db_pool_timeout, db_pool_recycle)
	
	Returns:
		Кортеж (sync_engine, async_engine, SessionLocal)
	"""
	settings = get_settings()
	
	sync_engine = create_engine(
		settings.database_url,
		pool_pre_ping=True,
		pool_size=settings.db_pool_size,
		max_overflow=settings.db_max_overflow,
		pool_timeout=settings.db_pool_timeout,
		pool_recycle=settings.db_pool_recycle,
	)
	
	async_engine = create_async_engine(
		resolve_async_url(settings.database_url, settings.database_url_async),
		pool_pre_ping=True,
		pool_size=settings.db_pool_size,
		max_overflow=settings.db_max_overflow,
		pool_timeout=settings.db_pool_timeout,
		pool_recycle=settings.db_pool_recycle,
	)
	
	SessionLocal = async_sessionmaker(
		async_engine,
		expire_on_commit=False,
		autoflush=False,
		class_=AsyncSession,
	)
	
	return sync_engine, async_engine, SessionLocal


def make_get_db(SessionLocal: async_sessionmaker) -> Callable:
	"""
	Создает функцию get_db для использования в FastAPI зависимостях.
	
	Args:
		SessionLocal: Sessionmaker для создания сессий
	
	Returns:
		Функция get_db для использования в Depends()
	"""
	async def get_db() -> AsyncIterator[AsyncSession]:
		"""
		Зависимость FastAPI для получения сессии базы данных.
		
		Yields:
			AsyncSession: Асинхронная сессия базы данных
		"""
		async with SessionLocal() as session:
			yield session
	
	return get_db

