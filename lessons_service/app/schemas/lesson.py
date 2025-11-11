from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LessonCreate(BaseModel):
	title: str
	content: str = ""
	pgn_content: str | None = None
	order_index: int = Field(default=1, ge=1)
	duration_sec: int = Field(default=0, ge=0)


class LessonOut(BaseModel):
	id: int
	course_id: int
	title: str
	content: str
	pgn_content: str | None = None
	order_index: int
	duration_sec: int
	created_at: datetime

	class Config:
		from_attributes = True


class LessonUpdate(BaseModel):
	title: str | None = None
	content: str | None = None
	pgn_content: str | None = None
	order_index: int | None = Field(default=None, ge=1)
	duration_sec: int | None = Field(default=None, ge=0)


class PGNFileOut(BaseModel):
	id: int
	course_id: int
	course_title: str
	lesson_number: int
	lesson_title: str
	pgn_content: str
	created_at: datetime

	class Config:
		from_attributes = True


