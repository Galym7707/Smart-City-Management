from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db.database import Base


class PointGeometryType(TypeDecorator):
    impl = String(96)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(
                Geometry(geometry_type="POINT", srid=4326, spatial_index=False)
            )
        return dialect.type_descriptor(String(96))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, WKTElement):
            return value.data
        return value


POINT_GEOMETRY = PointGeometryType()


class PipelineStateRow(Base):
    __tablename__ = "pipeline_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    source: Mapped[str] = mapped_column(String(16), default="gee")
    state: Mapped[str] = mapped_column(String(16), default="degraded")
    provider_label: Mapped[str] = mapped_column(String(128), default="Google Earth Engine")
    project_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_sync_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latest_observation_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anomaly_count: Mapped[int] = mapped_column(Integer, default=0)
    status_message: Mapped[str] = mapped_column(
        Text,
        default="Run live sync to load the first Earth Engine screening snapshot.",
    )
    stages_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    area_label: Mapped[str] = mapped_column(String(128), default="Kazakhstan methane screening window")
    evidence_source: Mapped[str] = mapped_column(String(128), default="Google Earth Engine / Sentinel-5P")
    freshness: Mapped[str] = mapped_column(String(16), default="unavailable")
    screening_level: Mapped[str] = mapped_column(String(16), default="low")
    synced_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_successful_sync_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    observed_window: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_abs_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_note: Mapped[str] = mapped_column(
        Text,
        default="No verified live screening snapshot is stored yet.",
    )
    caveat: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str] = mapped_column(
        Text,
        default="Refresh the live methane screening before promoting any operational case.",
    )


class PipelineSyncRunRow(Base):
    __tablename__ = "pipeline_sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sync_trigger: Mapped[str] = mapped_column(String(16), default="manual")
    source: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16))
    provider_label: Mapped[str] = mapped_column(String(128))
    project_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_sync_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latest_observation_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    anomaly_count: Mapped[int] = mapped_column(Integer, default=0)
    status_message: Mapped[str] = mapped_column(Text)
    stages_json: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    area_label: Mapped[str] = mapped_column(String(128))
    evidence_source: Mapped[str] = mapped_column(String(128))
    freshness: Mapped[str] = mapped_column(String(16))
    screening_level: Mapped[str] = mapped_column(String(16))
    synced_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_successful_sync_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    observed_window: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_abs_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_note: Mapped[str] = mapped_column(Text)
    caveat: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str] = mapped_column(Text)


class AnomalyRow(Base):
    __tablename__ = "anomalies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    asset_name: Mapped[str] = mapped_column(String(255))
    region: Mapped[str] = mapped_column(String(128))
    facility_type: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(16))
    detected_at: Mapped[str] = mapped_column(String(64))
    methane_delta_pct: Mapped[float] = mapped_column(Float)
    methane_delta_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    co2e_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)
    flare_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    thermal_hits_72h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    night_thermal_hits_72h: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_ch4_ppb: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    baseline_window: Mapped[str | None] = mapped_column(Text, nullable=True)
    signal_score: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[str] = mapped_column(Text)
    coordinates: Mapped[str] = mapped_column(String(128))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location_geom: Mapped[object] = mapped_column(POINT_GEOMETRY)
    verification_area: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nearest_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nearest_landmark: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str] = mapped_column(Text)
    site_x: Mapped[int] = mapped_column(Integer)
    site_y: Mapped[int] = mapped_column(Integer)
    trend_json: Mapped[list[dict[str, int | str]]] = mapped_column(JSON, default=list)
    linked_incident_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    active: Mapped[bool] = mapped_column(default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class IncidentRow(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    anomaly_id: Mapped[str] = mapped_column(String(64), ForeignKey("anomalies.id"))
    title: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32))
    owner: Mapped[str] = mapped_column(String(128))
    priority: Mapped[str] = mapped_column(String(16))
    verification_window: Mapped[str] = mapped_column(String(64))
    report_generated_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    narrative: Mapped[str] = mapped_column(Text)
    report_sections_json: Mapped[list[dict[str, str]] | None] = mapped_column(JSON, nullable=True)

    tasks: Mapped[list["IncidentTaskRow"]] = relationship(
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentTaskRow.id",
    )


class IncidentTaskRow(Base):
    __tablename__ = "incident_tasks"

    id: Mapped[str] = mapped_column(String(96), primary_key=True)
    incident_id: Mapped[str] = mapped_column(String(64), ForeignKey("incidents.id"))
    title: Mapped[str] = mapped_column(String(255))
    owner: Mapped[str] = mapped_column(String(128))
    eta_hours: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))
    notes: Mapped[str] = mapped_column(Text)

    incident: Mapped[IncidentRow] = relationship(back_populates="tasks")


class ActivityEventRow(Base):
    __tablename__ = "activity_events"

    db_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(64), unique=True)
    occurred_at: Mapped[str] = mapped_column(String(64))
    stage: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(128))
    incident_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    metadata_json: Mapped[dict[str, str | int | float | bool | None]] = mapped_column(JSON, default=dict)
