from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
	BigInteger,
	CheckConstraint,
	DateTime,
	Enum as SQLEnum,
	ForeignKey,
	Index,
	Integer,
	JSON,
	Text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class GameStatus(str, Enum):
	CREATED = "CREATED"
	ACTIVE = "ACTIVE"
	PAUSED = "PAUSED"
	FINISHED = "FINISHED"


class SideToMove(str, Enum):
	WHITE = "w"
	BLACK = "b"


class GameResult(str, Enum):
	WHITE_WIN = "1-0"
	BLACK_WIN = "0-1"
	DRAW = "1/2-1/2"


class TerminationReason(str, Enum):
	CHECKMATE = "CHECKMATE"
	RESIGNATION = "RESIGNATION"
	TIMEOUT = "TIMEOUT"


side_to_move_db_enum = SQLEnum(
	SideToMove,
	name="games_side_to_move_enum",
	values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class Game(Base):
	__tablename__ = "games"

	id: Mapped[UUID] = mapped_column(
		PGUUID(as_uuid=True), primary_key=True, default=uuid4, nullable=False
	)
	white_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
	black_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
	initial_pos: Mapped[str] = mapped_column(Text, nullable=False, default="startpos")
	current_pos: Mapped[str] = mapped_column(Text, nullable=False)
	next_turn: Mapped[SideToMove] = mapped_column(
		side_to_move_db_enum,
		default=SideToMove.WHITE,
		nullable=False,
	)
	time_control: Mapped[dict[str, Any] | None] = mapped_column(
		JSON, nullable=True, default=None
	)
	move_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
	status: Mapped[GameStatus] = mapped_column(
		SQLEnum(GameStatus, name="games_status_enum"),
		default=GameStatus.CREATED,
		index=True,
		nullable=False,
	)
	white_clock_ms: Mapped[int] = mapped_column(
		BigInteger, nullable=False, default=0, server_default="0"
	)
	black_clock_ms: Mapped[int] = mapped_column(
		BigInteger, nullable=False, default=0, server_default="0"
	)
	result: Mapped[GameResult | None] = mapped_column(
		SQLEnum(GameResult, name="games_result_enum"), nullable=True
	)
	termination_reason: Mapped[TerminationReason | None] = mapped_column(
		SQLEnum(TerminationReason, name="games_termination_enum"),
		nullable=True,
	)
	ended_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
	pgn: Mapped[str | None] = mapped_column(Text, nullable=True)
	metadata_json: Mapped[dict[str, Any] | None] = mapped_column(
		"metadata", JSON, nullable=True, default=None
	)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), nullable=False, server_default="now()"
	)
	started_at: Mapped[datetime | None] = mapped_column(
		DateTime(timezone=True), nullable=True
	)
	finished_at: Mapped[datetime | None] = mapped_column(
		DateTime(timezone=True), nullable=True
	)

	moves = relationship(
		"Move", back_populates="game", order_by="Move.move_index", cascade="all, delete-orphan"
	)
	snapshots = relationship(
		"GameSnapshot",
		back_populates="game",
		order_by="GameSnapshot.snapshot_move_index",
		cascade="all, delete-orphan",
	)

	__table_args__ = (
		CheckConstraint("white_clock_ms >= 0", name="games_white_clock_non_negative"),
		CheckConstraint("black_clock_ms >= 0", name="games_black_clock_non_negative"),
		Index("ix_games_status_created_at", "status", "created_at"),
	)

class GameSnapshot(Base):
	__tablename__ = "game_snapshots"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
	game_id: Mapped[UUID] = mapped_column(
		PGUUID(as_uuid=True),
		ForeignKey("games.id", ondelete="CASCADE"),
		nullable=False,
		index=True,
	)
	snapshot_move_index: Mapped[int] = mapped_column(Integer, nullable=False)
	fen: Mapped[str] = mapped_column(Text, nullable=False)
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), nullable=False, server_default="now()"
	)

	game = relationship("Game", back_populates="snapshots")

	__table_args__ = (
		Index(
			"uq_game_snapshots_game_move_index",
			"game_id",
			"snapshot_move_index",
			unique=True,
		),
	)

