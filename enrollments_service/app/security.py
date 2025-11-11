from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import get_settings


bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> int:
	token = credentials.credentials
	settings = get_settings()
	try:
		payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
	except JWTError:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

	if payload.get("type") != "access":
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

	exp = payload.get("exp")
	if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

	sub = payload.get("sub")
	if not sub:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
	return int(sub)


def verify_internal_token(token: str | None = Header(default=None, alias="X-Internal-Token")) -> None:
	settings = get_settings()
	expected = settings.internal_api_token
	if expected is None:
		# token check disabled (dev mode)
		return
	if token != expected:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token")


