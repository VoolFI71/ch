"""add pgn_content to lessons

Revision ID: 0004
Revises: 0003
Create Date: 2025-01-27 12:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('lessons', sa.Column('pgn_content', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('lessons', 'pgn_content')

