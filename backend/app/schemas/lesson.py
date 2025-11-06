from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel


class LessonCreate(BaseModel):
    title: str
    content: str = ""
    pgn_content: str | None = None
    order_index: int = 1
    duration_sec: int = 0


class LessonOut(BaseModel):
    id: int
    course_id: int
    title: str
    content: str
    pgn_content: str | None = None
    order_index: int
    duration_sec: int
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


class PGNFileOut(BaseModel):
    id: int
    course_id: int
    course_title: str
    lesson_number: int
    lesson_title: str
    pgn_content: str
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


