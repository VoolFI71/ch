from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Lesson(Base):
	__tablename__ = "lessons"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	course_id: Mapped[int] = mapped_column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), index=True, nullable=False)
	title: Mapped[str] = mapped_column(String(255), nullable=False)
	content: Mapped[str] = mapped_column(Text, nullable=False, default="")
	pgn_content: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
	order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
	duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
	)

	course = relationship("Course", back_populates="lessons")


