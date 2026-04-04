"""baseline MRV schema with PostGIS geometry

Revision ID: 20260329_01
Revises:
Create Date: 2026-03-29 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry


# revision identifiers, used by Alembic.
revision = "20260329_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "pipeline_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("provider_label", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=True),
        sa.Column("last_sync_at", sa.String(length=64), nullable=True),
        sa.Column("latest_observation_at", sa.String(length=64), nullable=True),
        sa.Column("anomaly_count", sa.Integer(), nullable=False),
        sa.Column("status_message", sa.Text(), nullable=False),
        sa.Column("stages_json", sa.JSON(), nullable=False),
        sa.Column("area_label", sa.String(length=128), nullable=False),
        sa.Column("evidence_source", sa.String(length=128), nullable=False),
        sa.Column("freshness", sa.String(length=16), nullable=False),
        sa.Column("screening_level", sa.String(length=16), nullable=False),
        sa.Column("synced_at", sa.String(length=64), nullable=True),
        sa.Column("last_successful_sync_at", sa.String(length=64), nullable=True),
        sa.Column("observed_window", sa.Text(), nullable=True),
        sa.Column("current_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("baseline_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("delta_abs_ppb", sa.Float(), nullable=True),
        sa.Column("delta_pct", sa.Float(), nullable=True),
        sa.Column("confidence_note", sa.Text(), nullable=False),
        sa.Column("caveat", sa.Text(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=False),
    )

    op.create_table(
        "pipeline_sync_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("provider_label", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=True),
        sa.Column("last_sync_at", sa.String(length=64), nullable=True),
        sa.Column("latest_observation_at", sa.String(length=64), nullable=True),
        sa.Column("anomaly_count", sa.Integer(), nullable=False),
        sa.Column("status_message", sa.Text(), nullable=False),
        sa.Column("stages_json", sa.JSON(), nullable=False),
        sa.Column("area_label", sa.String(length=128), nullable=False),
        sa.Column("evidence_source", sa.String(length=128), nullable=False),
        sa.Column("freshness", sa.String(length=16), nullable=False),
        sa.Column("screening_level", sa.String(length=16), nullable=False),
        sa.Column("synced_at", sa.String(length=64), nullable=True),
        sa.Column("last_successful_sync_at", sa.String(length=64), nullable=True),
        sa.Column("observed_window", sa.Text(), nullable=True),
        sa.Column("current_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("baseline_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("delta_abs_ppb", sa.Float(), nullable=True),
        sa.Column("delta_pct", sa.Float(), nullable=True),
        sa.Column("confidence_note", sa.Text(), nullable=False),
        sa.Column("caveat", sa.Text(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=False),
    )
    op.create_index("ix_pipeline_sync_runs_created_at", "pipeline_sync_runs", ["created_at"])

    op.create_table(
        "anomalies",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("asset_name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=128), nullable=False),
        sa.Column("facility_type", sa.String(length=255), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("detected_at", sa.String(length=64), nullable=False),
        sa.Column("methane_delta_pct", sa.Float(), nullable=False),
        sa.Column("methane_delta_ppb", sa.Float(), nullable=True),
        sa.Column("co2e_tonnes", sa.Float(), nullable=True),
        sa.Column("flare_hours", sa.Float(), nullable=True),
        sa.Column("thermal_hits_72h", sa.Integer(), nullable=True),
        sa.Column("night_thermal_hits_72h", sa.Integer(), nullable=True),
        sa.Column("current_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("baseline_ch4_ppb", sa.Float(), nullable=True),
        sa.Column("evidence_source", sa.String(length=255), nullable=True),
        sa.Column("baseline_window", sa.Text(), nullable=True),
        sa.Column("signal_score", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Text(), nullable=False),
        sa.Column("coordinates", sa.String(length=128), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("location_geom", Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("verification_area", sa.String(length=255), nullable=True),
        sa.Column("nearest_address", sa.String(length=255), nullable=True),
        sa.Column("nearest_landmark", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("recommended_action", sa.Text(), nullable=False),
        sa.Column("site_x", sa.Integer(), nullable=False),
        sa.Column("site_y", sa.Integer(), nullable=False),
        sa.Column("trend_json", sa.JSON(), nullable=False),
        sa.Column("linked_incident_id", sa.String(length=64), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_anomalies_active_signal_score", "anomalies", ["active", "signal_score"])

    op.create_table(
        "incidents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("anomaly_id", sa.String(length=64), sa.ForeignKey("anomalies.id"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("owner", sa.String(length=128), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("verification_window", sa.String(length=64), nullable=False),
        sa.Column("report_generated_at", sa.String(length=64), nullable=True),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("report_sections_json", sa.JSON(), nullable=True),
    )
    op.create_index("ix_incidents_anomaly_id", "incidents", ["anomaly_id"])

    op.create_table(
        "incident_tasks",
        sa.Column("id", sa.String(length=96), primary_key=True),
        sa.Column("incident_id", sa.String(length=64), sa.ForeignKey("incidents.id"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("owner", sa.String(length=128), nullable=False),
        sa.Column("eta_hours", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
    )
    op.create_index("ix_incident_tasks_incident_id", "incident_tasks", ["incident_id"])

    op.create_table(
        "activity_events",
        sa.Column("db_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("occurred_at", sa.String(length=64), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("actor", sa.String(length=128), nullable=False),
        sa.Column("incident_id", sa.String(length=64), nullable=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.String(length=96), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_activity_events_db_id", "activity_events", ["db_id"])
    op.create_index("ix_activity_events_incident_id", "activity_events", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_activity_events_incident_id", table_name="activity_events")
    op.drop_index("ix_activity_events_db_id", table_name="activity_events")
    op.drop_table("activity_events")
    op.drop_index("ix_incident_tasks_incident_id", table_name="incident_tasks")
    op.drop_table("incident_tasks")
    op.drop_index("ix_incidents_anomaly_id", table_name="incidents")
    op.drop_table("incidents")
    op.drop_index("ix_anomalies_active_signal_score", table_name="anomalies")
    op.drop_table("anomalies")
    op.drop_index("ix_pipeline_sync_runs_created_at", table_name="pipeline_sync_runs")
    op.drop_table("pipeline_sync_runs")
    op.drop_table("pipeline_state")
