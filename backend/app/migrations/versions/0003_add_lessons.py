"""add lessons table

Revision ID: 0003
Revises: 0002
Create Date: 2025-10-25 00:40:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'lessons',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('duration_sec', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_lessons_course_id', 'lessons', ['course_id'], unique=False)
    op.create_index('ix_lessons_order_index', 'lessons', ['order_index'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_lessons_order_index', table_name='lessons')
    op.drop_index('ix_lessons_course_id', table_name='lessons')
    op.drop_table('lessons')


