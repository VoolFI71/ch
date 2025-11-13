from __future__ import annotations

import os
from logging import getLogger
from pathlib import Path

from alembic import command
from alembic.config import Config


logger = getLogger(__name__)


def _get_alembic_config() -> Config:
	base_dir = Path(__file__).resolve().parent

	alembic_cfg = Config()
	alembic_cfg.set_main_option("script_location", str(base_dir / "migrations"))

	db_url = os.getenv("DATABASE_URL") or os.getenv("database_url")
	if db_url:
		alembic_cfg.set_main_option("sqlalchemy.url", db_url)

	return alembic_cfg


def run_migrations() -> None:
	cfg = _get_alembic_config()
	command.upgrade(cfg, "head")
	logger.info("Auth service migrations applied")

