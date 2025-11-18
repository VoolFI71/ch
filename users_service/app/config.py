from common import BaseServiceSettings, make_get_settings


class Settings(BaseServiceSettings):
	app_name: str = "Users Service"


get_settings = make_get_settings(Settings)



