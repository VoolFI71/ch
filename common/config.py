"""Базовый класс настроек для всех сервисов."""
from functools import lru_cache
from typing import Callable

from pydantic_settings import BaseSettings, SettingsConfigDict


class BaseServiceSettings(BaseSettings):
	"""Базовый класс настроек для всех микросервисов."""
	
	app_name: str
	database_url: str
	database_url_async: str | None = None
	jwt_secret: str
	jwt_algorithm: str = "HS256"
	metrics_enabled: bool = True
	
	# Настройки пула соединений с базой данных
	db_pool_size: int = 10  # Базовый размер пула
	db_max_overflow: int = 20  # Дополнительные соединения при нагрузке
	db_pool_timeout: int = 30  # Таймаут ожидания свободного соединения (секунды)
	db_pool_recycle: int = 1800  # Пересоздание соединений через 30 минут
	
	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


def make_get_settings(settings_class: type[BaseServiceSettings]) -> Callable:
	"""
	Создает функцию get_settings для конкретного сервиса.
	
	Args:
		settings_class: Класс настроек, наследующийся от BaseServiceSettings
	
	Returns:
		Функция get_settings с кешированием
	"""
	@lru_cache
	def get_settings() -> BaseServiceSettings:
		return settings_class()
	
	return get_settings

