from __future__ import annotations

import os
from logging import getLogger
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


logger = getLogger(__name__)


def get_alembic_config() -> Config:
    # Alembic base directory lives at backend/app/migrations
    base_dir = Path(__file__).resolve().parent
    project_root = base_dir.parent.parent  # /app/backend

    alembic_cfg = Config()
    alembic_cfg.set_main_option("script_location", str(base_dir / "migrations"))

    # DATABASE_URL is provided via env (pydantic-settings consumes it too)
    db_url = os.getenv("DATABASE_URL") or os.getenv("database_url")
    if db_url:
        alembic_cfg.set_main_option("sqlalchemy.url", db_url)

    return alembic_cfg


def run_migrations() -> None:
    """Apply pending Alembic migrations at app startup."""
    cfg = get_alembic_config()
    try:
        command.upgrade(cfg, "head")
        logger.info("Alembic migrations applied")
    except Exception as exc:  # pragma: no cover
        # Fallback: DB might already have tables created previously without Alembic
        try:
            db_url = cfg.get_main_option("sqlalchemy.url") or os.getenv("DATABASE_URL") or os.getenv("database_url")
            if not db_url:
                raise
            engine = create_engine(db_url)
            inspector = inspect(engine)
            has_version = inspector.has_table("alembic_version")
            has_users = inspector.has_table("users")

            if not has_version and has_users:
                # Stamp baseline to initial migration and proceed
                command.stamp(cfg, "0001")
                command.upgrade(cfg, "head")
                logger.info("Stamped existing schema to 0001 and upgraded to head")
                return
        except Exception:  # pragma: no cover
            pass

        logger.error("Failed to run migrations: %s", exc)
        raise


