from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import get_settings


bearer_scheme = HTTPBearer(auto_error=True)


@dataclass
class CurrentUser:
	id: int
	token: str


async def get_current_user(
	credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
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

	return CurrentUser(id=int(sub), token=token)


async def get_current_user_id(current_user: CurrentUser = Depends(get_current_user)) -> int:
	return current_user.id


