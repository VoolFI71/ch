from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

DbSession = Session | AsyncSession
HealthCheck = Callable[[DbSession | None], Awaitable[None] | None]


def configure_observability(
    app: FastAPI,
    *,
    settings: Any,
    get_db: Optional[Callable[[], DbSession]] = None,
    extra_checks: Mapping[str, HealthCheck] | None = None,
) -> None:
    """Attach shared /healthz and /metrics endpoints with optional extra checks."""
    metrics_enabled = getattr(settings, "metrics_enabled", False)
    instrumentator = Instrumentator().instrument(app) if metrics_enabled else None
    if instrumentator:
        app.state.instrumentator = instrumentator

    checks = dict(extra_checks or {})

    async def _run_check(name: str, check: HealthCheck, db: DbSession | None) -> None:
        try:
            result = check(db)
            if inspect.isawaitable(result):
                await result  # type: ignore[func-returns-value]
        except Exception as exc:  # pragma: no cover - defensive
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"status": "error", "check": name, "error": str(exc)},
            ) from exc

    async def _ping_database(db: DbSession) -> None:
        if isinstance(db, AsyncSession):
            await db.execute(text("SELECT 1"))
        else:
            db.execute(text("SELECT 1"))

    if get_db:

        @app.get("/healthz")
        async def healthz(db: DbSession = Depends(get_db)) -> JSONResponse:
            results: dict[str, str] = {}
            try:
                await _ping_database(db)
                results["database"] = "ok"
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"status": "error", "check": "database", "error": str(exc)},
                ) from exc

            for name, check in checks.items():
                await _run_check(name, check, db)
                results[name] = "ok"

            return JSONResponse({"status": "ok", "checks": results})

    else:

        @app.get("/healthz")
        async def healthz() -> JSONResponse:
            results: dict[str, str] = {"database": "skipped"}
            for name, check in checks.items():
                await _run_check(name, check, None)
                results[name] = "ok"
            return JSONResponse({"status": "ok", "checks": results})

    @app.get("/metrics")
    def metrics() -> Response:
        if not metrics_enabled:
            return JSONResponse({"detail": "Metrics disabled"}, status_code=404)
        content = generate_latest()
        return Response(content=content, media_type=CONTENT_TYPE_LATEST)

