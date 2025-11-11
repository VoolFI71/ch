from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import get_settings


bearer_scheme = HTTPBearer(auto_error=True)


def decode_token(token: str) -> dict:
	settings = get_settings()
	return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> int:
	token = credentials.credentials
	try:
		payload = decode_token(token)
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


