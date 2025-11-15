from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Chess Courses API"
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    web_dir: str = "backend/web"
    # Optional external auth service base URL. If set, API will proxy auth endpoints there.
    auth_service_url: str | None = None
    api_internal_token: str | None = None
    kafka_broker_url: str | None = None

    # YooKassa settings
    yookassa_shop_id: str | None = None
    yookassa_secret_key: str | None = None
    public_base_url: str | None = None  # e.g., https://your.domain

    # Monitoring
    metrics_enabled: bool = True

    # Object storage (MinIO / S3)
    s3_endpoint: str | None = None
    s3_region: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_use_ssl: bool = False
    s3_bucket_videos: str | None = None
    s3_bucket_assets: str | None = None
    s3_presign_expire_seconds: int = 3600

    # Load from .env if present; environment variables take precedence
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()


