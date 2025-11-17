from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Game, GameStatus, SideToMove
from ..realtime import game_ws_manager
from ..schemas import (
	CreateGameRequest,
	GameDetail,
	GameSummary,
	JoinGameResponse,
	MoveListResponse,
	ResignRequest,
	TimeoutRequest,
	WsGameFinishedPayload,
	WsStatePayload,
)
from ..security import get_current_user_id
from ..services import (
	GameService,
	GameServiceError,
	build_game_detail,
	build_game_summary,
	build_move_out,
	schedule_auto_cancel,
)

router = APIRouter(prefix="/api/games", tags=["games"])

RECENT_MOVES_LIMIT = 60


def _handle_error(exc: GameServiceError) -> HTTPException:
	return HTTPException(status_code=exc.status_code, detail=exc.message)


async def _broadcast_state(game: GameDetail) -> None:
	await game_ws_manager.broadcast(
		game.id,
		WsStatePayload(type="state", game=game).model_dump(mode="json"),
	)


async def _broadcast_finished(game: GameDetail) -> None:
	await game_ws_manager.broadcast(
		game.id,
		WsGameFinishedPayload(type="game_finished", game=game).model_dump(mode="json"),
	)


def _build_detail(service: GameService, game: Game, *, limit: int = RECENT_MOVES_LIMIT) -> GameDetail:
	moves = service.get_moves(game.id, limit=limit)
	return build_game_detail(game, moves=moves)


@router.post("/", response_model=GameDetail, status_code=status.HTTP_201_CREATED)
async def create_game(
	payload: CreateGameRequest,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: Session = Depends(get_db),
) -> GameDetail:
	service = GameService(db)
	try:
		game = service.create_game(creator_id=current_user_id, payload=payload)
	except GameServiceError as exc:
		raise _handle_error(exc)

	game_detail = _build_detail(service, game)
	await _broadcast_state(game_detail)
	return game_detail


@router.get("/", response_model=list[GameSummary])
async def list_games(
	statuses: Annotated[list[GameStatus] | None, Query(alias="status")] = None,
	limit: Annotated[int, Query(ge=1, le=100)] = 25,
	db: Session = Depends(get_db),
) -> list[GameSummary]:
	service = GameService(db)
	games = service.list_games(statuses=statuses, limit=limit)
	return [build_game_summary(game) for game in games]


@router.get("/{game_id}", response_model=GameDetail)
async def get_game(
	game_id: UUID,
	limit: Annotated[int | None, Query(alias="moves_limit", ge=1, le=500)] = 120,
	db: Session = Depends(get_db),
) -> GameDetail:
	service = GameService(db)
	try:
		game, moves = service.get_game_with_moves(game_id, limit=limit)
	except GameServiceError as exc:
		raise _handle_error(exc)
	return build_game_detail(game, moves=moves)


@router.get("/{game_id}/moves", response_model=MoveListResponse)
async def list_moves(
	game_id: UUID,
	limit: Annotated[int | None, Query(ge=1, le=500)] = 200,
	db: Session = Depends(get_db),
) -> MoveListResponse:
	service = GameService(db)
	moves = service.get_moves(game_id, limit=limit)
	return MoveListResponse(items=[build_move_out(move) for move in moves])


@router.post("/{game_id}/join", response_model=JoinGameResponse)
async def join_game(
	game_id: UUID,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: Session = Depends(get_db),
) -> JoinGameResponse:
	service = GameService(db)
	try:
		game = service.join_game(game_id, player_id=current_user_id)
	except GameServiceError as exc:
		raise _handle_error(exc)

	await schedule_auto_cancel(game)
	game_detail = _build_detail(service, game)
	await _broadcast_state(game_detail)
	return game_detail


@router.post("/{game_id}/resign", response_model=GameDetail)
async def resign_game(
	game_id: UUID,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	_: ResignRequest | None = None,
	db: Session = Depends(get_db),
) -> GameDetail:
	service = GameService(db)
	try:
		game = service.resign(game_id, player_id=current_user_id)
	except GameServiceError as exc:
		raise _handle_error(exc)

	game_detail = _build_detail(service, game)
	await _broadcast_finished(game_detail)
	return game_detail


@router.post("/{game_id}/timeout", response_model=GameDetail)
async def declare_timeout(
	game_id: UUID,
	request: TimeoutRequest,
	current_user_id: Annotated[int, Depends(get_current_user_id)],
	db: Session = Depends(get_db),
) -> GameDetail:
	service = GameService(db)
	loser = SideToMove.WHITE if request.loser_color == "white" else SideToMove.BLACK
	try:
		game = service.timeout(
			game_id,
			loser_color=loser,
			requested_by=current_user_id,
		)
	except GameServiceError as exc:
		raise _handle_error(exc)

	game_detail = _build_detail(service, game)
	await _broadcast_finished(game_detail)
	return game_detail

