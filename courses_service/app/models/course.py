from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Course(Base):
	__tablename__ = "courses"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
	title: Mapped[str] = mapped_column(String(255), nullable=False)
	description: Mapped[str] = mapped_column(String(2048), default="", nullable=False)
	price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
	is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)


