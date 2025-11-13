from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	database_url: str
	app_name: str = "Payments Service"
	metrics_enabled: bool = True
	payments_internal_token: str | None = None

	# YooKassa
	yookassa_shop_id: str | None = None
	yookassa_secret_key: str | None = None
	public_base_url: str | None = None

	# JWT (для проверки access-токена)
	jwt_secret: str
	jwt_algorithm: str = "HS256"

	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
	return Settings()


