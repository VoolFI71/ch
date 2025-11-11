from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
import httpx

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import LoginInput, RefreshInput, Token, UserCreate, UserOut
from ..security import (
	get_current_user,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate) -> UserOut:
	settings = get_settings()
	if not settings.auth_service_url:
		raise HTTPException(status_code=503, detail="Auth service is not configured")
	auth_url = settings.auth_service_url.rstrip("/") + "/api/auth/register"
	with httpx.Client(timeout=10.0) as client:
		res = client.post(auth_url, json=user_in.model_dump())
		if not res.is_success:
			try:
				detail = res.json().get("detail")
			except Exception:
				detail = res.text
			raise HTTPException(status_code=res.status_code, detail=detail or "Auth service error")
		return UserOut.model_validate(res.json())


@router.post("/login", response_model=Token)
def login(data: LoginInput) -> Token:
	settings = get_settings()
	if not settings.auth_service_url:
		raise HTTPException(status_code=503, detail="Auth service is not configured")
	auth_url = settings.auth_service_url.rstrip("/") + "/api/auth/login"
	with httpx.Client(timeout=10.0) as client:
		res = client.post(auth_url, json=data.model_dump())
		if not res.is_success:
			try:
				detail = res.json().get("detail")
			except Exception:
				detail = res.text
			raise HTTPException(status_code=res.status_code, detail=detail or "Auth service error")
		return Token.model_validate(res.json())


@router.post("/refresh", response_model=Token)
def refresh(data: RefreshInput) -> Token:
	settings = get_settings()
	if not settings.auth_service_url:
		raise HTTPException(status_code=503, detail="Auth service is not configured")
	auth_url = settings.auth_service_url.rstrip("/") + "/api/auth/refresh"
	with httpx.Client(timeout=10.0) as client:
		res = client.post(auth_url, json=data.model_dump())
		if not res.is_success:
			try:
				detail = res.json().get("detail")
			except Exception:
				detail = res.text
			raise HTTPException(status_code=res.status_code, detail=detail or "Auth service error")
		return Token.model_validate(res.json())


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user


