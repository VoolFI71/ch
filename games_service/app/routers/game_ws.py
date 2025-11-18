from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from ..database import SessionLocal
from ..models import Game, GameStatus
from ..realtime import ConnectionInfo, game_ws_manager
from ..schemas import (
	MakeMovePayload,
	WsErrorPayload,
	WsGameFinishedPayload,
	WsMoveMadePayload,
	WsStatePayload,
)
from ..security import decode_access_token
from ..services import (
	GameService,
	GameServiceError,
	build_game_detail,
	build_move_out,
)

router = APIRouter()

RECENT_MOVES_LIMIT = 60


def _resolve_role(game: Game, user_id: int | None) -> str:
	if user_id is None:
		return "viewer"
	if user_id == game.white_id:
		return "white"
	if user_id == game.black_id:
		return "black"
	return "viewer"


@router.websocket("/ws/games/{game_id}")
async def game_socket(
	game_id: UUID,
	websocket: WebSocket,
	token: Annotated[str | None, Query()] = None,
) -> None:
	user_id: int | None = None
	if token:
		try:
			current_user = decode_access_token(token)
		except Exception:
			await websocket.close(code=4401)
			return
		user_id = current_user.id

	# Одна сессия БД на всё WebSocket-соединение
	async with SessionLocal() as db:
		service = GameService(db)
		try:
			game, moves = await service.get_game_with_moves(game_id, limit=RECENT_MOVES_LIMIT)
		except GameServiceError:
			await websocket.close(code=4404)
			return
		detail = build_game_detail(game, moves=moves)

		role = _resolve_role(game, user_id)
		await game_ws_manager.connect(
			game_id,
			ConnectionInfo(websocket=websocket, user_id=user_id, role=role),
		)
		await websocket.send_json(
			WsStatePayload(type="state", game=detail).model_dump(mode="json")
		)

		try:
			while True:
				data = await websocket.receive_json()
				try:
					payload = MakeMovePayload.model_validate(data)
				except ValidationError:
					await websocket.send_json(
						WsErrorPayload(
							type="error",
							message="Invalid payload",
							client_move_id=data.get("client_move_id") if isinstance(data, dict) else None,
						).model_dump(mode="json")
					)
					continue

				if not user_id:
					await websocket.send_json(
						WsErrorPayload(
							type="move_rejected",
							message="Authentication required",
							client_move_id=payload.client_move_id,
						).model_dump(mode="json")
					)
					continue

				# Используем ту же сессию db и service, что были созданы выше
				try:
					game, move = await service.make_move(
						game_id,
						player_id=user_id,
						payload=payload,
					)
				except GameServiceError as exc:
					await websocket.send_json(
						WsErrorPayload(
							type="move_rejected",
							message=exc.message,
							client_move_id=payload.client_move_id,
						).model_dump()
					)
					continue

				moves = await service.get_moves(game_id, limit=RECENT_MOVES_LIMIT)
				game_detail = build_game_detail(game, moves=moves)

				await game_ws_manager.broadcast(
					game_id,
					WsMoveMadePayload(
						type="move_made",
						client_move_id=payload.client_move_id,
						move=build_move_out(move),
						game=game_detail,
					).model_dump(mode="json"),
				)

				if game.status == GameStatus.FINISHED.value:
					await game_ws_manager.broadcast(
						game_id,
						WsGameFinishedPayload(
							type="game_finished", game=game_detail
						).model_dump(mode="json"),
					)

		except WebSocketDisconnect:
			await game_ws_manager.disconnect(websocket)
		# Сессия автоматически закроется здесь при выходе из async with

