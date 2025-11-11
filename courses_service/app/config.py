from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	database_url: str
	app_name: str = "Courses Service"
	metrics_enabled: bool = True
	jwt_secret: str
	jwt_algorithm: str = "HS256"
	enrollments_service_url: str | None = None
	enrollments_internal_token: str | None = None

	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
	return Settings()


