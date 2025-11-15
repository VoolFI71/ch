from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
	username: str = Field(
		min_length=3,
		max_length=32,
		pattern=r"^[A-Za-z0-9_.-]+$",
		description="Уникальное имя пользователя (латиница, цифры, _ . -)",
	)
	email: EmailStr
	password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
	id: int
	email: EmailStr
	username: str
	is_active: bool
	created_at: datetime
	updated_at: datetime

	class Config:
		from_attributes = True


class LoginInput(BaseModel):
	email: EmailStr
	password: str


class RefreshInput(BaseModel):
	refresh_token: str


class Token(BaseModel):
	access_token: str
	refresh_token: str
	token_type: str = "bearer"


