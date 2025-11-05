"""add courses, enrollments, orders

Revision ID: 0002
Revises: 0001
Create Date: 2025-10-25 00:10:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'courses',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('slug', sa.String(length=120), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('price_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('slug', name='uq_courses_slug'),
    )
    op.create_index('ix_courses_slug', 'courses', ['slug'], unique=False)
    op.create_index('ix_courses_title', 'courses', ['title'], unique=False)

    op.create_table(
        'enrollments',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'course_id', name='uq_enrollments_user_course'),
    )
    op.create_index('ix_enrollments_user_id', 'enrollments', ['user_id'], unique=False)
    op.create_index('ix_enrollments_course_id', 'enrollments', ['course_id'], unique=False)

    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('course_id', sa.Integer(), sa.ForeignKey('courses.id', ondelete='SET NULL'), nullable=True),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='RUB'),
        sa.Column('provider', sa.String(length=32), nullable=False, server_default='manual'),
        sa.Column('provider_payment_id', sa.String(length=128), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_orders_user_id', 'orders', ['user_id'], unique=False)
    op.create_index('ix_orders_course_id', 'orders', ['course_id'], unique=False)
    op.create_index('ix_orders_provider_payment_id', 'orders', ['provider_payment_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_orders_provider_payment_id', table_name='orders')
    op.drop_index('ix_orders_course_id', table_name='orders')
    op.drop_index('ix_orders_user_id', table_name='orders')
    op.drop_table('orders')

    op.drop_index('ix_enrollments_course_id', table_name='enrollments')
    op.drop_index('ix_enrollments_user_id', table_name='enrollments')
    op.drop_table('enrollments')

    op.drop_index('ix_courses_title', table_name='courses')
    op.drop_index('ix_courses_slug', table_name='courses')
    op.drop_table('courses')


