from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..schemas import LoginInput, RefreshInput, Token, UserCreate, UserOut
from ..security import (
	RefreshTokenError,
	create_access_token,
	create_refresh_token,
	get_current_user,
	get_password_hash,
	validate_refresh_token,
	verify_password,
)

USERNAME_ALLOWED_RE = re.compile(r"[^A-Za-z0-9_.-]+")


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _sanitize_username(raw: str | None, email: str) -> str:
	base = (raw or "").strip()
	if not base:
		base = email.split("@", 1)[0]
	base = USERNAME_ALLOWED_RE.sub("-", base)
	base = base.strip("-_.")
	if len(base) < 3:
		base = (base + "user") if base else "user"
	base = base[:32]
	if len(base) < 3:
		base = base.ljust(3, "0")
	return base


async def _ensure_unique_username(base: str, db: AsyncSession) -> str:
	candidate = base
	suffix = 1
	while True:
		stmt = select(User.id).where(func.lower(User.username) == candidate.lower())
		exists = await db.scalar(stmt)
		if not exists:
			return candidate
		suffix += 1
		suffix_str = f"-{suffix}"
		max_len = 32 - len(suffix_str)
		candidate = f"{base[:max_len]}{suffix_str}"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)) -> UserOut:
	email = user_in.email.lower()
	username = _sanitize_username(user_in.username if hasattr(user_in, "username") else None, email)

	stmt = select(User).where(User.email == email)
	existing = await db.scalar(stmt)
	if existing:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

	username = await _ensure_unique_username(username, db)

	user = User(email=email, username=username, hashed_password=get_password_hash(user_in.password))
	db.add(user)
	await db.commit()
	await db.refresh(user)
	return user


@router.post("/login", response_model=Token)
async def login(data: LoginInput, db: AsyncSession = Depends(get_db)) -> Token:
	login_value = data.login.lower().strip()
	# Пытаемся найти пользователя по email или username
	stmt = select(User).where(
		(User.email == login_value) | (User.username == login_value)
	)
	user = await db.scalar(stmt)
	if not user or not verify_password(data.password, user.hashed_password):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect login or password")

	access = create_access_token(user.id)
	refresh = await create_refresh_token(db, user.id)
	return Token(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=Token)
async def refresh(data: RefreshInput, db: AsyncSession = Depends(get_db)) -> Token:
	try:
		token_record = await validate_refresh_token(db, data.refresh_token)
	except RefreshTokenError as exc:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.detail)

	user = await db.get(User, token_record.user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

	token_record.revoked = True
	token_record.revoked_at = datetime.now(timezone.utc)

	access = create_access_token(user.id)
	refresh_token = await create_refresh_token(db, user.id)
	return Token(access_token=access, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)) -> UserOut:
	return current_user


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user_by_id(user_id: int, db: AsyncSession = Depends(get_db)) -> UserOut:
	user = await db.get(User, user_id)
	if not user:
		raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
	return user


