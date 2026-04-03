"""add sync trigger to pipeline history

Revision ID: 20260329_02
Revises: 20260329_01
Create Date: 2026-03-29 00:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260329_02"
down_revision = "20260329_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pipeline_sync_runs",
        sa.Column("sync_trigger", sa.String(length=16), nullable=False, server_default="manual"),
    )
    op.execute("UPDATE pipeline_sync_runs SET sync_trigger = 'manual' WHERE sync_trigger IS NULL")
    op.alter_column("pipeline_sync_runs", "sync_trigger", server_default=None)


def downgrade() -> None:
    op.drop_column("pipeline_sync_runs", "sync_trigger")
