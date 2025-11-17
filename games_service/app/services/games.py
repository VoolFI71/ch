from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from threading import Lock
from typing import Sequence
from uuid import UUID

import chess
from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import (
	Game,
	GameResult,
	GameSnapshot,
	GameStatus,
	Move,
	SideToMove,
	TerminationReason,
)
from ..schemas import (
	CreateGameRequest,
	GameDetail,
	GameSummary,
	MakeMovePayload,
	MoveOut,
)
from ..realtime.manager import game_ws_manager

SNAPSHOT_INTERVAL = 50
AUTO_CANCEL_TIMEOUT_SECONDS = 30
_AUTO_CANCEL_TASKS: dict[UUID, asyncio.Task] = {}
_AUTO_CANCEL_DEADLINES: dict[UUID, datetime] = {}
_AUTO_CANCEL_LOCK = Lock()


class GameServiceError(Exception):
	def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
		super().__init__(message)
		self.message = message
		self.status_code = status_code


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _board_from_fen(fen: str) -> chess.Board:
	try:
		return chess.Board(fen)
	except ValueError as exc:
		raise GameServiceError("Invalid FEN supplied") from exc


def _initial_board(initial_fen: str | None) -> tuple[chess.Board, str]:
	if not initial_fen or initial_fen.lower() == "startpos":
		board = chess.Board()
		return board, "startpos"
	board = _board_from_fen(initial_fen)
	return board, board.fen()


def build_move_out(move: Move) -> MoveOut:
	return MoveOut.model_validate(move)


def build_game_summary(game: Game) -> GameSummary:
	return GameSummary.model_validate(game)


def build_game_detail(game: Game, moves: Sequence[Move] | None = None) -> GameDetail:
	summary = build_game_summary(game)
	data = summary.model_dump()
	data.update(
		{
			"initial_pos": game.initial_pos,
			"current_pos": game.current_pos,
			"time_control": game.time_control,
			"metadata": game.metadata_json,
			"pgn": game.pgn,
			"moves": [build_move_out(m) for m in moves] if moves else [],
		}
	)
	with _AUTO_CANCEL_LOCK:
		deadline = _AUTO_CANCEL_DEADLINES.get(game.id)
	if not deadline and game.metadata_json:
		raw_deadline = game.metadata_json.get("auto_cancel_deadline")
		if raw_deadline:
			try:
				deadline = datetime.fromisoformat(raw_deadline)
			except ValueError:
				deadline = None
	data["auto_cancel_at"] = deadline.isoformat() if deadline else None
	return GameDetail(**data)


def _persist_auto_cancel_deadline(game_id: UUID, deadline: datetime | None) -> None:
	with SessionLocal() as db:
		db_game = db.get(Game, game_id)
		if not db_game:
			return
		metadata = dict(db_game.metadata_json or {})
		if deadline:
			metadata["auto_cancel_deadline"] = deadline.isoformat()
		else:
			metadata.pop("auto_cancel_deadline", None)
		db_game.metadata_json = metadata or None
		db.commit()


async def _auto_cancel_job(game_id: UUID) -> None:
	try:
		await asyncio.sleep(AUTO_CANCEL_TIMEOUT_SECONDS)
		with SessionLocal() as db:
			game = db.get(Game, game_id)
			if not game:
				return
			if game.status != GameStatus.CREATED or game.move_count > 0:
				return
			db.delete(game)
			db.commit()
		await game_ws_manager.broadcast(
			game_id,
			{
				"type": "game_cancelled",
				"game_id": str(game_id),
			},
		)
	finally:
		with _AUTO_CANCEL_LOCK:
			_AUTO_CANCEL_TASKS.pop(game_id, None)
			_AUTO_CANCEL_DEADLINES.pop(game_id, None)


async def schedule_auto_cancel(game: Game) -> None:
	if (
		game.status != GameStatus.CREATED
		or game.move_count > 0
		or game.white_id is None
		or game.black_id is None
	):
		cancel_auto_cancel(game.id)
		return
	loop = asyncio.get_running_loop()
	with _AUTO_CANCEL_LOCK:
		if game.id in _AUTO_CANCEL_TASKS:
			return
		deadline = _utcnow() + timedelta(seconds=AUTO_CANCEL_TIMEOUT_SECONDS)
		_AUTO_CANCEL_TASKS[game.id] = loop.create_task(_auto_cancel_job(game.id))
		_AUTO_CANCEL_DEADLINES[game.id] = deadline
	_persist_auto_cancel_deadline(game.id, deadline)


def cancel_auto_cancel(game_id: UUID) -> None:
	with _AUTO_CANCEL_LOCK:
		task = _AUTO_CANCEL_TASKS.pop(game_id, None)
		_AUTO_CANCEL_DEADLINES.pop(game_id, None)
	if task:
		task.cancel()
	_persist_auto_cancel_deadline(game_id, None)


class GameService:
	def __init__(self, db: Session):
		self.db = db

	def create_game(self, *, creator_id: int, payload: CreateGameRequest) -> Game:
		board, initial_pos = _initial_board(payload.initial_fen)
		time_control = payload.time_control.dict() if payload.time_control else None
		initial_clock = payload.time_control.initial_ms if payload.time_control else 0

		if payload.creator_color == "white":
			white_id = creator_id
			black_id = None
		else:
			white_id = None
			black_id = creator_id

		game = Game(
			white_id=white_id,
			black_id=black_id,
			initial_pos=initial_pos,
			current_pos=board.fen(),
			next_turn=SideToMove.WHITE if board.turn == chess.WHITE else SideToMove.BLACK,
			time_control=time_control,
			move_count=0,
			white_clock_ms=initial_clock,
			black_clock_ms=initial_clock,
			metadata_json=payload.metadata,
		)

		self.db.add(game)
		self.db.commit()
		self.db.refresh(game)
		return game

	def list_games(
		self,
		*,
		statuses: list[GameStatus] | None = None,
		limit: int = 50,
	) -> list[Game]:
		stmt = select(Game).order_by(Game.created_at.desc()).limit(limit)
		if statuses:
			stmt = stmt.where(Game.status.in_(statuses))
		return list(self.db.execute(stmt).scalars().all())

	def get_game(self, game_id: UUID) -> Game:
		game = self.db.get(Game, game_id)
		if not game:
			raise GameServiceError("Game not found", status.HTTP_404_NOT_FOUND)
		return game

	def get_game_with_moves(self, game_id: UUID, *, limit: int | None = None) -> tuple[Game, list[Move]]:
		game = self.get_game(game_id)
		moves = self.get_moves(game_id, limit=limit)
		return game, moves

	def get_moves(self, game_id: UUID, *, limit: int | None = None) -> list[Move]:
		stmt = (
			select(Move)
			.where(Move.game_id == game_id)
			.order_by(Move.move_index.desc())
		)
		if limit is not None:
			stmt = stmt.limit(limit)
		moves = list(self.db.execute(stmt).scalars().all())
		moves.reverse()
		return moves

	def join_game(self, game_id: UUID, *, player_id: int) -> Game:
		game = self._lock_game(game_id)
		if game.status != GameStatus.CREATED:
			raise GameServiceError("Game is not open for joining", status.HTTP_409_CONFLICT)
		if player_id in {game.white_id, game.black_id}:
			raise GameServiceError("You are already part of this game", status.HTTP_400_BAD_REQUEST)
		if game.white_id is not None and game.black_id is not None:
			raise GameServiceError("Game already has two players", status.HTTP_409_CONFLICT)

		if game.white_id is None:
			game.white_id = player_id
		else:
			game.black_id = player_id
		self.db.commit()
		self.db.refresh(game)
		return game

	def make_move(
		self,
		game_id: UUID,
		*,
		player_id: int,
		payload: MakeMovePayload,
	) -> tuple[Game, Move]:
		game = self._lock_game(game_id)
		if game.status == GameStatus.FINISHED:
			raise GameServiceError("Game already finished", status.HTTP_409_CONFLICT)
		if not game.white_id or not game.black_id:
			raise GameServiceError("Cannot start until second player joins")

		expected_player = game.white_id if game.next_turn == SideToMove.WHITE else game.black_id
		if player_id != expected_player:
			raise GameServiceError("Not your turn", status.HTTP_403_FORBIDDEN)

		board = _board_from_fen(game.current_pos)
		try:
			move_obj = chess.Move.from_uci(payload.uci)
		except ValueError as exc:
			raise GameServiceError("Invalid UCI move") from exc

		if move_obj not in board.legal_moves:
			raise GameServiceError("Illegal move")

		is_capture = board.is_capture(move_obj)
		san = board.san(move_obj)
		board.push(move_obj)
		new_fen = board.fen()

		move_index = game.move_count + 1
		move = Move(
			game_id=game.id,
			move_index=move_index,
			uci=payload.uci,
			san=san,
			fen_after=new_fen,
			player_id=player_id,
			clocks_after={
				"white_ms": payload.white_clock_ms,
				"black_ms": payload.black_clock_ms,
			},
			is_capture=is_capture,
			promotion=payload.promotion,
		)

		if payload.white_clock_ms < 0 or payload.black_clock_ms < 0:
			raise GameServiceError("Clock values must be non-negative")

		game.current_pos = new_fen
		game.move_count = move_index
		game.white_clock_ms = payload.white_clock_ms
		game.black_clock_ms = payload.black_clock_ms
		game.next_turn = SideToMove.BLACK if game.next_turn == SideToMove.WHITE else SideToMove.WHITE

		if game.status == GameStatus.CREATED:
			game.status = GameStatus.ACTIVE
			game.started_at = _utcnow()

		self.db.add(move)

		if move_index % SNAPSHOT_INTERVAL == 0:
			self.db.add(
				GameSnapshot(
					game_id=game.id,
					snapshot_move_index=move_index,
					fen=new_fen,
				)
			)

		if board.is_checkmate():
			winner = SideToMove.WHITE if player_id == game.white_id else SideToMove.BLACK
			self._finish_game(
				game,
				winner=winner,
				reason=TerminationReason.CHECKMATE,
				ended_by=player_id,
			)

		self.db.commit()
		self.db.refresh(game)
		self.db.refresh(move)
		cancel_auto_cancel(game.id)
		return game, move

	def resign(self, game_id: UUID, *, player_id: int) -> Game:
		game = self._lock_game(game_id)
		if game.status == GameStatus.FINISHED:
			raise GameServiceError("Game already finished", status.HTTP_409_CONFLICT)
		if player_id not in (game.white_id, game.black_id):
			raise GameServiceError("You are not a participant", status.HTTP_403_FORBIDDEN)

		winner = SideToMove.BLACK if player_id == game.white_id else SideToMove.WHITE
		self._finish_game(
			game,
			winner=winner,
			reason=TerminationReason.RESIGNATION,
			ended_by=player_id,
		)
		self.db.commit()
		self.db.refresh(game)
		return game

	def timeout(self, game_id: UUID, *, loser_color: SideToMove, requested_by: int) -> Game:
		game = self._lock_game(game_id)
		if game.status == GameStatus.FINISHED:
			raise GameServiceError("Game already finished", status.HTTP_409_CONFLICT)
		if requested_by not in (game.white_id, game.black_id):
			raise GameServiceError("You are not a participant", status.HTTP_403_FORBIDDEN)
		if loser_color == SideToMove.WHITE and game.white_clock_ms > 0:
			raise GameServiceError("White clock has not expired")
		if loser_color == SideToMove.BLACK and game.black_clock_ms > 0:
			raise GameServiceError("Black clock has not expired")

		winner = SideToMove.BLACK if loser_color == SideToMove.WHITE else SideToMove.WHITE
		self._finish_game(
			game,
			winner=winner,
			reason=TerminationReason.TIMEOUT,
			ended_by=requested_by,
		)
		self.db.commit()
		self.db.refresh(game)
		return game

	def _finish_game(
		self,
		game: Game,
		*,
		winner: SideToMove | None,
		reason: TerminationReason,
		ended_by: int | None,
	) -> None:
		cancel_auto_cancel(game.id)
		game.status = GameStatus.FINISHED
		game.finished_at = _utcnow()
		game.termination_reason = reason
		game.ended_by = ended_by
		if winner is None:
			game.result = GameResult.DRAW
			return
		game.result = (
			GameResult.WHITE_WIN if winner == SideToMove.WHITE else GameResult.BLACK_WIN
		)

	def _lock_game(self, game_id: UUID) -> Game:
		stmt = select(Game).where(Game.id == game_id).with_for_update()
		game = self.db.execute(stmt).scalars().first()
		if not game:
			raise GameServiceError("Game not found", status.HTTP_404_NOT_FOUND)
		return game

