from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Payments Service"
	payments_internal_token: str | None = None
	kafka_broker_url: str | None = None
	
	# YooKassa
	yookassa_shop_id: str | None = None
	yookassa_secret_key: str | None = None
	public_base_url: str | None = None


get_settings = make_get_settings(Settings)


