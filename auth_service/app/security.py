import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common import make_internal_token_verifier

from .config import get_settings
from .database import get_db
from .models import RefreshToken, User


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=True)


def verify_password(plain_password: str, hashed_password: str) -> bool:
	return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
	return pwd_context.hash(password)


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
	return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_token(
	*, subject: str, token_type: str, expires_delta: timedelta, extra_claims: dict | None = None
) -> str:
	settings = get_settings()
	expire = _now() + expires_delta
	payload = {"sub": subject, "type": token_type, "exp": int(expire.timestamp())}
	if extra_claims:
		payload |= extra_claims
	return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
	settings = get_settings()
	return _create_token(
		subject=str(user_id),
		token_type="access",
		expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
	)


class RefreshTokenError(Exception):
	def __init__(self, detail: str):
		self.detail = detail
		super().__init__(detail)


async def create_refresh_token(db: AsyncSession, user_id: int) -> str:
	settings = get_settings()
	expires_delta = timedelta(days=settings.refresh_token_expire_days)
	token_uuid = uuid4()
	token = _create_token(
		subject=str(user_id),
		token_type="refresh",
		expires_delta=expires_delta,
		extra_claims={"jti": str(token_uuid)},
	)
	record = RefreshToken(
		token_id=token_uuid,
		user_id=user_id,
		token_hash=_hash_token(token),
		expires_at=_now() + expires_delta,
	)
	db.add(record)
	await db.commit()
	return token


def decode_token(token: str) -> dict:
	settings = get_settings()
	return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def validate_refresh_token(db: AsyncSession, token: str) -> RefreshToken:
	try:
		payload = decode_token(token)
	except JWTError as exc:
		raise RefreshTokenError("Недействительный refresh-токен") from exc

	if payload.get("type") != "refresh":
		raise RefreshTokenError("Неверный тип токена")

	token_id = payload.get("jti")
	if not token_id:
		raise RefreshTokenError("У токена нет идентификатора")

	try:
		token_uuid = UUID(token_id)
	except ValueError as exc:
		raise RefreshTokenError("Повреждённый идентификатор токена") from exc

	stmt = select(RefreshToken).where(RefreshToken.token_id == token_uuid)
	result = await db.execute(stmt)
	record = result.scalars().first()
	if not record:
		raise RefreshTokenError("Refresh-токен не найден")

	if record.revoked:
		raise RefreshTokenError("Refresh-токен уже использован")

	if record.expires_at <= _now():
		raise RefreshTokenError("Refresh-токен истёк")

	if str(payload.get("sub")) != str(record.user_id):
		raise RefreshTokenError("Токен пользователя не совпадает")

	token_hash = _hash_token(token)
	if token_hash != record.token_hash:
		raise RefreshTokenError("Подпись refresh-токена не распознана")

	return record


async def get_current_user(
	credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
	db: AsyncSession = Depends(get_db),
) -> User:
	token = credentials.credentials
	try:
		payload = decode_token(token)
	except JWTError:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

	if payload.get("type") != "access":
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

	user_id = payload.get("sub")
	if not user_id:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

	user: Optional[User] = await db.get(User, int(user_id))
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

	return user


verify_internal_token = make_internal_token_verifier(lambda: get_settings().auth_internal_token)

