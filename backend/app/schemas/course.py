from __future__ import annotations

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

    model_config = {
        "from_attributes": True,
    }


class CourseCreate(BaseModel):
    # id is optional: allow explicit id for initial seeding (e.g., id=1)
    id: int | None = None
    slug: str
    title: str
    description: str = ""
    price_cents: int = 0
    is_active: bool = True


