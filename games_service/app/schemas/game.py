from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ..models import GameResult, GameStatus, SideToMove, TerminationReason


class TimeControlSettings(BaseModel):
	initial_ms: int = Field(300000, ge=0)
	increment_ms: int = Field(0, ge=0)
	type: str = Field(default="STANDARD", max_length=32)


class CreateGameRequest(BaseModel):
	initial_fen: str | None = Field(
		default=None, description="FEN строки или 'startpos' для стандартного начала"
	)
	creator_color: Literal["white", "black"] = Field(
		default="white", description="Цвет, которым будет играть создатель партии"
	)
	metadata: dict[str, Any] | None = None
	time_control: TimeControlSettings | None = None


class GameSummary(BaseModel):
	model_config = ConfigDict(from_attributes=True, use_enum_values=True)

	id: UUID
	white_id: int | None
	black_id: int | None
	status: GameStatus
	next_turn: SideToMove
	move_count: int
	white_clock_ms: int
	black_clock_ms: int
	result: GameResult | None = None
	termination_reason: TerminationReason | None = None
	created_at: datetime
	started_at: datetime | None = None
	finished_at: datetime | None = None


class MoveOut(BaseModel):
	model_config = ConfigDict(from_attributes=True, use_enum_values=True)

	id: int
	game_id: UUID
	move_index: int
	uci: str
	san: str | None = None
	fen_after: str
	player_id: int | None = None
	clocks_after: dict[str, Any] | None = None
	is_capture: bool
	promotion: str | None = None
	created_at: datetime


class GameDetail(GameSummary):
	initial_pos: str
	current_pos: str
	time_control: dict[str, Any] | None = None
	metadata: dict[str, Any] | None = None
	white_clock_ms: int
	black_clock_ms: int
	pgn: str | None = None
	moves: list[MoveOut] = Field(default_factory=list)
	auto_cancel_at: datetime | None = None


class JoinGameResponse(GameDetail):
	pass


class MoveListResponse(BaseModel):
	items: list[MoveOut]


class ResignRequest(BaseModel):
	side: Literal["white", "black"] | None = None


class TimeoutRequest(BaseModel):
	loser_color: Literal["white", "black"]


class MakeMovePayload(BaseModel):
	type: Literal["make_move"]
	uci: str
	white_clock_ms: int = Field(ge=0)
	black_clock_ms: int = Field(ge=0)
	promotion: str | None = Field(default=None, max_length=1)
	client_move_id: str | None = Field(
		default=None, description="Клиентский идентификатор для сопоставления ответов"
	)


class WsErrorPayload(BaseModel):
	type: Literal["move_rejected", "error"]
	message: str
	client_move_id: str | None = None


class WsMoveMadePayload(BaseModel):
	type: Literal["move_made"]
	client_move_id: str | None = None
	move: MoveOut
	game: GameDetail


class WsGameFinishedPayload(BaseModel):
	type: Literal["game_finished"]
	game: GameDetail


class WsStatePayload(BaseModel):
	type: Literal["state"]
	game: GameDetail

