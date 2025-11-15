from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
	Boolean,
	DateTime,
	ForeignKey,
	Index,
	Integer,
	JSON,
	String,
	Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Move(Base):
	__tablename__ = "moves"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	game_id: Mapped[UUID] = mapped_column(
		PGUUID(as_uuid=True),
		ForeignKey("games.id", ondelete="CASCADE"),
		nullable=False,
		index=True,
	)
	move_index: Mapped[int] = mapped_column(Integer, nullable=False)
	uci: Mapped[str] = mapped_column(String(12), nullable=False)
	san: Mapped[str | None] = mapped_column(String(32), nullable=True)
	fen_after: Mapped[str] = mapped_column(Text, nullable=False)
	player_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
	clocks_after: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
	is_capture: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
	promotion: Mapped[str | None] = mapped_column(String(1), nullable=True)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), nullable=False, server_default="now()"
	)

	game = relationship("Game", back_populates="moves")

	__table_args__ = (
		Index("uq_moves_game_move_index", "game_id", "move_index", unique=True),
		Index("ix_moves_game_created_at", "game_id", "created_at"),
	)

