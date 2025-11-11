from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
	email: EmailStr
	password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
	id: int
	email: EmailStr

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


