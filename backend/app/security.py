from fastapi.security import HTTPBearer

from common import make_internal_token_verifier

from .config import get_settings

# Gateway delegates user management to auth_service; we only need the bearer scheme helper
bearer_scheme = HTTPBearer(auto_error=True)

verify_internal_token = make_internal_token_verifier(lambda: get_settings().api_internal_token)

