from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginInput, RefreshInput, Token, UserCreate, UserOut
from ..security import (
	create_access_token,
	create_refresh_token,
	get_current_user,
	get_password_hash,
	verify_password,
	decode_token,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
	email = user_in.email.lower()
	existing = db.query(User).filter(User.email == email).first()
	if existing:
		raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

	user = User(email=email, hashed_password=get_password_hash(user_in.password))
	db.add(user)
	db.commit()
	db.refresh(user)
	return user


@router.post("/login", response_model=Token)
def login(data: LoginInput, db: Session = Depends(get_db)) -> Token:
	email = data.email.lower()
	user = db.query(User).filter(User.email == email).first()
	if not user or not verify_password(data.password, user.hashed_password):
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

	access = create_access_token(user.id)
	refresh = create_refresh_token(user.id)
	return Token(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=Token)
def refresh(data: RefreshInput, db: Session = Depends(get_db)) -> Token:
	try:
		payload = decode_token(data.refresh_token)
	except Exception:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

	if payload.get("type") != "refresh":
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

	user_id = int(payload.get("sub"))
	user = db.get(User, user_id)
	if not user or not user.is_active:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

	access = create_access_token(user.id)
	refresh = create_refresh_token(user.id)
	return Token(access_token=access, refresh_token=refresh)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
	return current_user


