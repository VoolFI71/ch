import asyncio
import contextlib
import logging

from sqlalchemy import select

from .database import SessionLocal
from .models import Game, GameStatus, SideToMove
from .realtime import game_ws_manager
from .schemas import WsGameFinishedPayload
from .services import GameService, GameServiceError, build_game_detail

LOGGER = logging.getLogger(__name__)
WATCHDOG_INTERVAL_SECONDS = 15
RECENT_MOVES_LIMIT = 120


class TimeoutWatchdog:
	def __init__(self) -> None:
		self._task: asyncio.Task | None = None

	def start(self) -> None:
		if self._task and not self._task.done():
			return
		self._task = asyncio.create_task(self._run(), name="timeout-watchdog")

	async def stop(self) -> None:
		if not self._task:
			return
		self._task.cancel()
		with contextlib.suppress(asyncio.CancelledError):
			await self._task
		self._task = None

	async def _run(self) -> None:
		while True:
			try:
				await self._tick()
			except asyncio.CancelledError:
				raise
			except Exception:  # pragma: no cover - defensive logging
				LOGGER.exception("Timeout watchdog iteration failed")
			await asyncio.sleep(WATCHDOG_INTERVAL_SECONDS)

	async def _tick(self) -> None:
		async with SessionLocal() as db:
			service = GameService(db)
			stmt = select(Game).where(Game.status == GameStatus.ACTIVE.value)
			result = await db.execute(stmt)
			active_games = result.scalars().all()
			for game in active_games:
				try:
					white_clock, black_clock = await service._compute_effective_clocks(game)
				except Exception:
					LOGGER.exception("Failed to compute clocks for game %s", game.id)
					continue

				loser: SideToMove | None = None
				if white_clock <= 0 and black_clock > 0:
					loser = SideToMove.WHITE
				elif black_clock <= 0 and white_clock > 0:
					loser = SideToMove.BLACK
				elif white_clock <= 0 and black_clock <= 0:
					loser = SideToMove.WHITE

				if not loser:
					continue

				requested_by = game.black_id if loser == SideToMove.WHITE else game.white_id
				if requested_by is None:
					continue

				try:
					finished_game = await service.timeout(
						game.id, loser_color=loser, requested_by=requested_by
					)
				except GameServiceError as exc:
					if exc.message not in {"White clock has not expired", "Black clock has not expired"}:
						LOGGER.warning(
							"Auto-timeout failed for game %s: %s", game.id, exc.message
						)
					continue

				moves = await service.get_moves(game.id, limit=RECENT_MOVES_LIMIT)
				detail = build_game_detail(finished_game, moves=moves)
				await game_ws_manager.broadcast(
					game.id,
					WsGameFinishedPayload(type="game_finished", game=detail).model_dump(mode="json"),
				)


timeout_watchdog = TimeoutWatchdog()

