from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class RefreshToken(Base):
	__tablename__ = "refresh_tokens"
	__table_args__ = (
		UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
	)

	id: Mapped[int] = mapped_column(Integer, primary_key=True)
	token_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, unique=True)
	user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
	token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
	expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
	revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
	revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), server_default=func.now(), nullable=False
	)


