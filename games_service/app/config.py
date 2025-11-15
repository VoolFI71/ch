from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	app_name: str = "Games Service"
	database_url: str
	jwt_secret: str
	jwt_algorithm: str = "HS256"
	metrics_enabled: bool = True

	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
	return Settings()

