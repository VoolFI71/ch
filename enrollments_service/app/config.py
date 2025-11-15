from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	database_url: str
	jwt_secret: str
	jwt_algorithm: str = "HS256"
	app_name: str = "Enrollments Service"
	metrics_enabled: bool = True
	enrollments_internal_token: str | None = None
	kafka_broker_url: str | None = None

	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
	return Settings()


