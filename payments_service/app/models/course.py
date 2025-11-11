from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Course(Base):
	__tablename__ = "courses"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	slug: Mapped[str] = mapped_column(String(255), unique=True)
	title: Mapped[str] = mapped_column(String(255))
	description: Mapped[str] = mapped_column(String(2048), default="")
	price_cents: Mapped[int] = mapped_column(Integer, default=0)
	is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


