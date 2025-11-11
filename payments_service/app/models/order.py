from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class OrderStatusEnum(str, PyEnum):
	PENDING = "pending"
	PAID = "paid"
	FAILED = "failed"
	CANCELLED = "cancelled"


class Order(Base):
	__tablename__ = "orders"

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
	course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
	amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
	currency: Mapped[str] = mapped_column(String(3), nullable=False, default="RUB")
	provider: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
	provider_payment_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
	status: Mapped[str] = mapped_column(String(16), nullable=False, default=OrderStatusEnum.PENDING.value)
	created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
	updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


