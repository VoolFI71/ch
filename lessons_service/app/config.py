from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Lessons Service"
	enrollments_service_url: str | None = None
	enrollments_internal_token: str | None = None
	lessons_internal_token: str | None = None
	kafka_broker_url: str | None = None


get_settings = make_get_settings(Settings)


