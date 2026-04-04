from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["high", "medium", "watch"]
IncidentStatus = Literal["triage", "verification", "mitigation"]
TaskStatus = Literal["open", "done"]
PipelineSource = Literal["gee"]
PipelineState = Literal["ready", "degraded", "error", "syncing"]
PipelineSyncTrigger = Literal["manual", "scheduled"]
EvidenceFreshness = Literal["fresh", "stale", "unavailable"]
ScreeningLevel = Literal["low", "medium", "high"]
ActivityStage = Literal["ingest", "incident", "verification", "report"]
ActivitySource = Literal["gee", "workflow"]
ActivityEntityType = Literal["pipeline", "anomaly", "incident", "task", "report"]
ActivityAction = Literal[
    "screening_loaded",
    "anomaly_promoted",
    "task_created",
    "task_completed",
    "report_generated",
    "gee_sync_verified",
]
ActivityMetadataValue = str | int | float | bool | None


class SitePosition(BaseModel):
    x: int = Field(ge=0, le=100)
    y: int = Field(ge=0, le=100)


class TrendPoint(BaseModel):
    label: str
    anomaly_index: int = Field(ge=0, le=100)


class KpiCard(BaseModel):
    label: str
    value: str
    detail: str


class IncidentTask(BaseModel):
    id: str
    title: str
    owner: str
    eta_hours: int = Field(gt=0)
    status: TaskStatus
    notes: str


class Anomaly(BaseModel):
    id: str
    asset_name: str
    region: str
    facility_type: str
    severity: Severity
    detected_at: str
    methane_delta_pct: float
    methane_delta_ppb: float | None = None
    co2e_tonnes: float | None = None
    flare_hours: float | None = None
    thermal_hits_72h: int | None = None
    night_thermal_hits_72h: int | None = None
    current_ch4_ppb: float | None = None
    baseline_ch4_ppb: float | None = None
    evidence_source: str | None = None
    baseline_window: str | None = None
    signal_score: int = Field(ge=0, le=100)
    confidence: str
    coordinates: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    verification_area: str | None = None
    nearest_address: str | None = None
    nearest_landmark: str | None = None
    summary: str
    recommended_action: str
    site_position: SitePosition
    trend: list[TrendPoint] = Field(default_factory=list)
    linked_incident_id: str | None = None


class Incident(BaseModel):
    id: str
    anomaly_id: str
    title: str
    status: IncidentStatus
    owner: str
    priority: str
    verification_window: str
    report_generated_at: str | None = None
    narrative: str
    tasks: list[IncidentTask]
    report_sections: list["ReportSection"] | None = None


class ReportSection(BaseModel):
    title: str
    body: str


class ActivityEvent(BaseModel):
    id: str
    occurred_at: str
    stage: ActivityStage
    source: ActivitySource
    action: ActivityAction
    title: str
    detail: str
    actor: str
    incident_id: str | None = None
    entity_type: ActivityEntityType
    entity_id: str | None = None
    metadata: dict[str, ActivityMetadataValue] = Field(default_factory=dict)


class DashboardPayload(BaseModel):
    kpis: list[KpiCard]
    anomalies: list[Anomaly]
    incidents: list[Incident]
    activity_feed: list[ActivityEvent]


class ActivityFeedPayload(BaseModel):
    events: list[ActivityEvent]


class PromoteAnomalyRequest(BaseModel):
    owner: str = "MRV response lead"


class CreateTaskRequest(BaseModel):
    title: str
    owner: str
    eta_hours: int = 4
    notes: str = ""


class GenerateReportResponse(BaseModel):
    incident: Incident
    report: list[ReportSection]


class PipelineStage(BaseModel):
    label: str
    value: str
    detail: str


class ScreeningEvidenceSnapshot(BaseModel):
    area_label: str
    evidence_source: str
    freshness: EvidenceFreshness
    screening_level: ScreeningLevel
    synced_at: str | None = None
    last_successful_sync_at: str | None = None
    observed_window: str | None = None
    current_ch4_ppb: float | None = None
    baseline_ch4_ppb: float | None = None
    delta_abs_ppb: float | None = None
    delta_pct: float | None = None
    confidence_note: str
    caveat: str | None = None
    recommended_action: str


class PipelineStatus(BaseModel):
    source: PipelineSource
    state: PipelineState
    provider_label: str
    project_id: str | None = None
    last_sync_at: str | None = None
    latest_observation_at: str | None = None
    anomaly_count: int
    status_message: str
    stages: list[PipelineStage]
    screening_snapshot: ScreeningEvidenceSnapshot | None = None


class PipelineScheduleStatus(BaseModel):
    enabled: bool
    interval_minutes: int | None = None
    next_run_at: str | None = None
    run_on_startup: bool = False


class PipelineHistoryEntry(BaseModel):
    id: int
    created_at: str
    trigger: PipelineSyncTrigger
    status: PipelineStatus


class PipelineHistoryPayload(BaseModel):
    runs: list[PipelineHistoryEntry]
    schedule: PipelineScheduleStatus


class PipelineSyncRequest(BaseModel):
    source: PipelineSource = "gee"


class PipelineSyncResponse(BaseModel):
    status: PipelineStatus
