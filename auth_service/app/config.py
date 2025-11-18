from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Auth Service"
	access_token_expire_minutes: int = 15
	refresh_token_expire_days: int = 30
	auth_internal_token: str | None = None
	kafka_broker_url: str | None = None


get_settings = make_get_settings(Settings)


