from datetime import datetime

from pydantic import BaseModel


class CourseOut(BaseModel):
	id: int
	slug: str
	title: str
	description: str
	price_cents: int
	is_active: bool
	created_at: datetime

	class Config:
		from_attributes = True


class CourseCreate(BaseModel):
	id: int | None = None
	slug: str
	title: str
	description: str = ""
	price_cents: int = 0
	is_active: bool = True


