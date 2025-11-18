from common import (
	bearer_scheme,
	make_get_current_user,
	make_get_current_user_id,
	make_internal_token_verifier,
)
from .config import get_settings

# Создаем функции для зависимостей FastAPI
get_current_user = make_get_current_user(get_settings)
get_current_user_id = make_get_current_user_id(get_current_user)

# Верификация внутренних токенов
verify_internal_token = make_internal_token_verifier(
	lambda: get_settings().payments_internal_token
)

__all__ = [
	"bearer_scheme",
	"get_current_user",
	"get_current_user_id",
	"verify_internal_token",
]

