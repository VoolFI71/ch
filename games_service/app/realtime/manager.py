from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from fastapi import WebSocket

Role = Literal["white", "black", "viewer"]


@dataclass
class ConnectionInfo:
	websocket: WebSocket
	user_id: int | None
	role: Role


class GameConnectionManager:
	def __init__(self) -> None:
		self._connections: dict[UUID, dict[WebSocket, ConnectionInfo]] = {}
		self._lock = asyncio.Lock()

	async def connect(self, game_id: UUID, connection: ConnectionInfo) -> None:
		await connection.websocket.accept()
		async with self._lock:
			self._connections.setdefault(game_id, {})[connection.websocket] = connection

	async def disconnect(self, websocket: WebSocket) -> None:
		async with self._lock:
			for game_id, bucket in list(self._connections.items()):
				if websocket in bucket:
					bucket.pop(websocket, None)
					if not bucket:
						self._connections.pop(game_id, None)
					break

	async def broadcast(self, game_id: UUID, message: dict) -> None:
		async with self._lock:
			targets = list(self._connections.get(game_id, {}).keys())
		for ws in targets:
			try:
				await ws.send_json(message)
			except Exception:
				await self.disconnect(ws)

	async def send_personal(self, websocket: WebSocket, message: dict) -> None:
		try:
			await websocket.send_json(message)
		except Exception:
			await self.disconnect(websocket)


game_ws_manager = GameConnectionManager()

