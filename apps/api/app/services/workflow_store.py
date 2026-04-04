from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from geoalchemy2.elements import WKTElement
from sqlalchemy import desc, select
from sqlalchemy.orm import joinedload

from app.db import database as db_database
from app.db.tables import (
    ActivityEventRow,
    AnomalyRow,
    IncidentRow,
    IncidentTaskRow,
    PipelineStateRow,
    PipelineSyncRunRow,
)
from app.models import (
    ActivityEvent,
    Anomaly,
    CreateTaskRequest,
    DashboardPayload,
    GenerateReportResponse,
    Incident,
    IncidentTask,
    KpiCard,
    PipelineHistoryEntry,
    PipelineSyncTrigger,
    PipelineStage,
    PipelineStatus,
    PromoteAnomalyRequest,
    ReportSection,
    ScreeningEvidenceSnapshot,
    SitePosition,
    TrendPoint,
)
from app.providers.gee import GeeCandidate
from app.services.report_exports import (
    Locale,
    PreparedReport,
    prepare_report,
    render_docx,
    render_html,
    render_pdf,
)


class WorkflowStore:
    PIPELINE_STATE_ID = 1
    ACTIVITY_FEED_LIMIT = 8
    PIPELINE_HISTORY_LIMIT = 10

    def __init__(self, project_id: str | None = None) -> None:
        self.project_id = project_id or os.getenv("EARTH_ENGINE_PROJECT", "gen-lang-client-0372752376")

    @property
    def anomalies(self) -> list[Anomaly]:
        return self.list_anomalies()

    def dashboard(self) -> DashboardPayload:
        status = self.get_pipeline_status(self.project_id)
        anomalies = self.list_anomalies()
        return DashboardPayload(
            kpis=self._build_live_kpis(anomalies, status.latest_observation_at),
            anomalies=anomalies,
            incidents=self.list_incidents(),
            activity_feed=self.list_activity(),
        )

    def list_activity(self) -> list[ActivityEvent]:
        with db_database.SessionLocal() as session:
            rows = session.scalars(
                select(ActivityEventRow)
                .order_by(desc(ActivityEventRow.db_id))
                .limit(self.ACTIVITY_FEED_LIMIT)
            ).all()
            return [self._activity_from_row(row) for row in rows]

    def list_incident_activity(self, incident_id: str) -> list[ActivityEvent]:
        with db_database.SessionLocal() as session:
            if session.get(IncidentRow, incident_id) is None:
                raise KeyError(incident_id)

            rows = session.scalars(
                select(ActivityEventRow)
                .where(ActivityEventRow.incident_id == incident_id)
                .order_by(desc(ActivityEventRow.db_id))
            ).all()
            return [self._activity_from_row(row) for row in rows]

    def screening_snapshot(self) -> ScreeningEvidenceSnapshot:
        return self.get_pipeline_status(self.project_id).screening_snapshot or self._default_pipeline_status(
            self.project_id
        ).screening_snapshot

    def list_anomalies(self) -> list[Anomaly]:
        with db_database.SessionLocal() as session:
            rows = session.scalars(
                select(AnomalyRow)
                .where(AnomalyRow.active.is_(True))
                .order_by(desc(AnomalyRow.signal_score), desc(AnomalyRow.detected_at))
            ).all()
            return [self._anomaly_from_row(row) for row in rows]

    def list_incidents(self) -> list[Incident]:
        with db_database.SessionLocal() as session:
            rows = (
                session.execute(
                    select(IncidentRow)
                    .options(joinedload(IncidentRow.tasks))
                    .order_by(desc(IncidentRow.id))
                )
                .unique()
                .scalars()
                .all()
            )
            return [self._incident_from_row(row) for row in rows]

    def get_incident(self, incident_id: str) -> Incident:
        with db_database.SessionLocal() as session:
            row = self._load_incident_row(session, incident_id)
            return self._incident_from_row(row)

    def get_pipeline_status(self, project_id: str | None = None) -> PipelineStatus:
        with db_database.SessionLocal() as session:
            row = session.get(PipelineStateRow, self.PIPELINE_STATE_ID)
            if row is None:
                fallback = self._default_pipeline_status(project_id or self.project_id)
                saved = self._save_pipeline_status(
                    session,
                    fallback,
                    record_history=False,
                    record_activity=False,
                    sync_trigger="manual",
                )
                session.commit()
                return saved
            return self._pipeline_status_from_state_row(row)

    def list_pipeline_history(self, limit: int = PIPELINE_HISTORY_LIMIT) -> list[PipelineHistoryEntry]:
        with db_database.SessionLocal() as session:
            rows = session.scalars(
                select(PipelineSyncRunRow)
                .order_by(desc(PipelineSyncRunRow.id))
                .limit(limit)
            ).all()
            return [
                PipelineHistoryEntry(
                    id=row.id,
                    created_at=self._format_datetime(row.created_at),
                    trigger=row.sync_trigger,  # type: ignore[arg-type]
                    status=self._pipeline_status_from_sync_run_row(row),
                )
                for row in rows
            ]

    def save_pipeline_status(
        self,
        status: PipelineStatus,
        *,
        record_history: bool = True,
        record_activity: bool = True,
        sync_trigger: PipelineSyncTrigger = "manual",
    ) -> PipelineStatus:
        with db_database.SessionLocal() as session:
            saved = self._save_pipeline_status(
                session,
                status,
                record_history=record_history,
                record_activity=record_activity,
                sync_trigger=sync_trigger,
            )
            session.commit()
            return saved

    def apply_fresh_screening_evidence(
        self,
        *,
        synced_at: str,
        project_id: str | None,
        observed_window: str | None,
        latest_observation_at: str | None,
        mean_ch4_ppb: float | None,
        baseline_ch4_ppb: float | None,
        delta_abs_ppb: float | None,
        delta_pct: float | None,
        screening_level: str,
        status_message: str,
    ) -> ScreeningEvidenceSnapshot:
        return ScreeningEvidenceSnapshot(
            area_label="Kazakhstan methane screening window",
            evidence_source="Google Earth Engine / Sentinel-5P",
            freshness="fresh",
            screening_level=screening_level,  # type: ignore[arg-type]
            synced_at=synced_at,
            last_successful_sync_at=synced_at,
            observed_window=observed_window or latest_observation_at,
            current_ch4_ppb=mean_ch4_ppb,
            baseline_ch4_ppb=baseline_ch4_ppb,
            delta_abs_ppb=delta_abs_ppb,
            delta_pct=delta_pct,
            confidence_note=(
                "Live Earth Engine screening refreshed successfully. This is a screening signal, not pinpoint source attribution."
            ),
            caveat=(
                f"Latest observation at {latest_observation_at}. Project: {project_id or 'not reported'}."
                if latest_observation_at
                else f"Project: {project_id or 'not reported'}."
            ),
            recommended_action=(
                "Review the refreshed satellite comparison, then promote manually if this area still deserves operational verification."
            ),
        )

    def mark_screening_stale(self, *, synced_at: str, caveat: str) -> ScreeningEvidenceSnapshot:
        with db_database.SessionLocal() as session:
            current = self._load_snapshot_from_state(session)
            if current is None or current.current_ch4_ppb is None:
                return self._build_live_placeholder_snapshot(
                    synced_at=synced_at,
                    freshness="stale",
                    caveat=caveat,
                    recommended_action="Retry live sync before making an operational decision from this page.",
                )

            current.freshness = "stale"
            current.synced_at = synced_at
            current.caveat = caveat
            current.recommended_action = (
                "Use the last successful screening snapshot as context, then decide manually whether promotion still makes sense."
            )
            return current

    def mark_screening_unavailable(
        self, *, synced_at: str, caveat: str
    ) -> ScreeningEvidenceSnapshot:
        with db_database.SessionLocal() as session:
            current = self._load_snapshot_from_state(session)
            if current is None or current.current_ch4_ppb is None:
                return self._build_live_placeholder_snapshot(
                    synced_at=synced_at,
                    freshness="unavailable",
                    caveat=caveat,
                    recommended_action="Live evidence is unavailable. Retry sync before promoting a new operational case.",
                )

            current.freshness = "unavailable"
            current.synced_at = synced_at
            current.caveat = caveat
            current.recommended_action = (
                "Treat the last verified screening snapshot as context only until live sync succeeds again."
            )
            return current

    def _default_pipeline_status(self, project_id: str | None = None) -> PipelineStatus:
        return PipelineStatus(
            source="gee",
            state="degraded",
            provider_label="Google Earth Engine",
            project_id=project_id or self.project_id,
            last_sync_at=None,
            latest_observation_at=None,
            anomaly_count=0,
            status_message="Run live sync to load the first Earth Engine screening snapshot.",
            stages=[
                PipelineStage(
                    label="Ingest layer",
                    value="Waiting for first sync",
                    detail="No live CH4 scene has been loaded into the project yet.",
                ),
                PipelineStage(
                    label="Normalization layer",
                    value="No live queue yet",
                    detail="Candidate ranking begins only after a successful Earth Engine refresh.",
                ),
                PipelineStage(
                    label="Verification layer",
                    value="Workflow ready",
                    detail="Incidents, tasks, and MRV reports become actionable once a live candidate is promoted.",
                ),
            ],
            screening_snapshot=ScreeningEvidenceSnapshot(
                area_label="Kazakhstan methane screening window",
                evidence_source="Google Earth Engine / Sentinel-5P",
                freshness="unavailable",
                screening_level="low",
                synced_at=None,
                last_successful_sync_at=None,
                observed_window=None,
                current_ch4_ppb=None,
                baseline_ch4_ppb=None,
                delta_abs_ppb=None,
                delta_pct=None,
                confidence_note="No verified live screening snapshot is stored yet.",
                caveat="Run the first live Earth Engine sync to load methane screening for Kazakhstan.",
                recommended_action="Refresh the live methane screening before promoting any operational case.",
            ),
        )

    def _build_live_placeholder_snapshot(
        self,
        *,
        synced_at: str,
        freshness: Literal["stale", "unavailable"],
        caveat: str,
        recommended_action: str,
    ) -> ScreeningEvidenceSnapshot:
        return ScreeningEvidenceSnapshot(
            area_label="Kazakhstan methane screening window",
            evidence_source="Google Earth Engine / Sentinel-5P",
            freshness=freshness,
            screening_level="low",
            synced_at=synced_at,
            last_successful_sync_at=None,
            observed_window=None,
            current_ch4_ppb=None,
            baseline_ch4_ppb=None,
            delta_abs_ppb=None,
            delta_pct=None,
            confidence_note="No verified live screening snapshot is stored yet.",
            caveat=f"{caveat} No previous verified live screening snapshot is available yet.",
            recommended_action=recommended_action,
        )

    def _now(self) -> str:
        return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    def _format_datetime(self, value: datetime | None) -> str:
        if value is None:
            return self._now()
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")

    def apply_live_candidates(
        self,
        *,
        candidates: list[GeeCandidate],
        latest_observation_at: str | None,
    ) -> None:
        del latest_observation_at
        with db_database.SessionLocal() as session:
            bind = session.get_bind()
            dialect_name = bind.dialect.name if bind is not None else "sqlite"
            active_ids = {candidate.id for candidate in candidates}
            for row in session.scalars(select(AnomalyRow).where(AnomalyRow.active.is_(True))).all():
                if row.id not in active_ids:
                    row.active = False

            if active_ids:
                existing_rows = {
                    row.id: row
                    for row in session.scalars(
                        select(AnomalyRow).where(AnomalyRow.id.in_(list(active_ids)))
                    ).all()
                }
            else:
                existing_rows = {}

            for candidate in candidates:
                row = existing_rows.get(candidate.id)
                site_position = self._candidate_site_position(candidate.latitude, candidate.longitude)
                if row is None:
                    row = AnomalyRow(
                        id=candidate.id,
                        asset_name=candidate.asset_name,
                        region=candidate.region,
                        facility_type=candidate.facility_type,
                        severity=candidate.severity,
                        detected_at=candidate.detected_at,
                        methane_delta_pct=round(candidate.methane_delta_pct, 2),
                        methane_delta_ppb=round(candidate.methane_delta_ppb, 2),
                        co2e_tonnes=None,
                        flare_hours=None,
                        thermal_hits_72h=candidate.thermal_hits_72h,
                        night_thermal_hits_72h=candidate.night_thermal_hits_72h,
                        current_ch4_ppb=round(candidate.current_ch4_ppb, 2),
                        baseline_ch4_ppb=round(candidate.baseline_ch4_ppb, 2),
                        evidence_source=candidate.evidence_source,
                        baseline_window=candidate.baseline_window,
                        signal_score=candidate.signal_score,
                        confidence=candidate.confidence,
                        coordinates=candidate.coordinates,
                        latitude=candidate.latitude,
                        longitude=candidate.longitude,
                        location_geom=self._point_geometry_value(
                            dialect_name,
                            candidate.latitude,
                            candidate.longitude,
                        ),
                        verification_area=candidate.verification_area,
                        nearest_address=candidate.nearest_address,
                        nearest_landmark=candidate.nearest_landmark,
                        summary=candidate.summary,
                        recommended_action=candidate.recommended_action,
                        site_x=site_position.x,
                        site_y=site_position.y,
                        trend_json=[],
                        linked_incident_id=None,
                        active=True,
                    )
                    session.add(row)
                    continue

                row.asset_name = candidate.asset_name
                row.region = candidate.region
                row.facility_type = candidate.facility_type
                row.severity = candidate.severity
                row.detected_at = candidate.detected_at
                row.methane_delta_pct = round(candidate.methane_delta_pct, 2)
                row.methane_delta_ppb = round(candidate.methane_delta_ppb, 2)
                row.co2e_tonnes = None
                row.flare_hours = None
                row.thermal_hits_72h = candidate.thermal_hits_72h
                row.night_thermal_hits_72h = candidate.night_thermal_hits_72h
                row.current_ch4_ppb = round(candidate.current_ch4_ppb, 2)
                row.baseline_ch4_ppb = round(candidate.baseline_ch4_ppb, 2)
                row.evidence_source = candidate.evidence_source
                row.baseline_window = candidate.baseline_window
                row.signal_score = candidate.signal_score
                row.confidence = candidate.confidence
                row.coordinates = candidate.coordinates
                row.latitude = candidate.latitude
                row.longitude = candidate.longitude
                row.location_geom = self._point_geometry_value(
                    dialect_name,
                    candidate.latitude,
                    candidate.longitude,
                )
                row.verification_area = candidate.verification_area
                row.nearest_address = candidate.nearest_address
                row.nearest_landmark = candidate.nearest_landmark
                row.summary = candidate.summary
                row.recommended_action = candidate.recommended_action
                row.site_x = site_position.x
                row.site_y = site_position.y
                row.active = True

            session.commit()

    def promote_anomaly(self, anomaly_id: str, payload: PromoteAnomalyRequest) -> Incident:
        with db_database.SessionLocal() as session:
            anomaly_row = self._load_anomaly_row(session, anomaly_id)
            if anomaly_row.linked_incident_id:
                return self._incident_from_row(
                    self._load_incident_row(session, anomaly_row.linked_incident_id)
                )

            incident_suffix = anomaly_row.id
            if incident_suffix.startswith("AN-"):
                incident_suffix = incident_suffix[3:]
            elif incident_suffix.startswith("GEE-"):
                incident_suffix = incident_suffix[4:]
            incident_id = f"INC-{incident_suffix}"

            incident_row = IncidentRow(
                id=incident_id,
                anomaly_id=anomaly_row.id,
                title=f"New verification case for {anomaly_row.asset_name}",
                status="triage",
                owner=payload.owner,
                priority="P1" if anomaly_row.severity == "high" else "P2",
                verification_window="Next 12 hours" if anomaly_row.severity == "high" else "Next 24 hours",
                report_generated_at=None,
                narrative=(
                    "This incident was promoted from the live screening queue. The signal is operationally ranked, "
                    "but it still requires field verification before source attribution."
                    if anomaly_row.evidence_source
                    else "This incident was promoted directly from the anomaly queue for manual verification."
                ),
                tasks=[
                    IncidentTaskRow(
                        id=f"{incident_id}-TASK-1",
                        title="Validate signal persistence against 12-week baseline",
                        owner="Remote sensing analyst",
                        eta_hours=2,
                        status="done",
                        notes="Baseline and current window exported for review.",
                    ),
                    IncidentTaskRow(
                        id=f"{incident_id}-TASK-2",
                        title="Assign field verification owner",
                        owner="Area operations coordinator",
                        eta_hours=4,
                        status="open",
                        notes="Route can be merged with scheduled integrity patrol.",
                    ),
                ],
            )
            session.add(incident_row)
            anomaly_row.linked_incident_id = incident_id
            session.flush()

            self._record_activity(
                session,
                stage="ingest",
                source="gee" if anomaly_row.evidence_source else "workflow",
                action="screening_loaded",
                title="Measurement evidence linked to incident",
                detail=(
                    f"{anomaly_row.id} screening evidence for {anomaly_row.asset_name} "
                    f"was attached to {incident_id} before escalation."
                ),
                actor="Earth Engine screening" if anomaly_row.evidence_source else "Workflow",
                incident_id=incident_id,
                entity_type="anomaly",
                entity_id=anomaly_row.id,
                metadata={
                    "signal_score": anomaly_row.signal_score,
                    "co2e_tonnes": anomaly_row.co2e_tonnes if anomaly_row.co2e_tonnes is not None else "not estimated",
                    "night_thermal_hits_72h": anomaly_row.night_thermal_hits_72h
                    if anomaly_row.night_thermal_hits_72h is not None
                    else "not available",
                    "severity": anomaly_row.severity,
                },
            )
            self._record_activity(
                session,
                stage="incident",
                source="workflow",
                action="anomaly_promoted",
                title="Incident created from screening signal",
                detail=f"{anomaly_row.asset_name} was promoted into {incident_id} with owner {payload.owner}.",
                actor=payload.owner,
                incident_id=incident_id,
                entity_type="incident",
                entity_id=incident_id,
                metadata={
                    "anomaly_id": anomaly_row.id,
                    "owner": payload.owner,
                    "priority": incident_row.priority,
                },
            )
            session.commit()
            return self._incident_from_row(self._load_incident_row(session, incident_id))

    def create_task(self, incident_id: str, payload: CreateTaskRequest) -> Incident:
        with db_database.SessionLocal() as session:
            incident_row = self._load_incident_row(session, incident_id)
            task_row = IncidentTaskRow(
                id=f"{incident_id}-TASK-{len(incident_row.tasks) + 1}",
                incident_id=incident_id,
                title=payload.title,
                owner=payload.owner,
                eta_hours=payload.eta_hours,
                status="open",
                notes=payload.notes,
            )
            incident_row.tasks.append(task_row)
            incident_row.report_sections_json = None
            session.flush()
            self._record_activity(
                session,
                stage="verification",
                source="workflow",
                action="task_created",
                title="Verification task created",
                detail=f"{task_row.title} was assigned to {task_row.owner} for {incident_id}.",
                actor=task_row.owner,
                incident_id=incident_id,
                entity_type="task",
                entity_id=task_row.id,
                metadata={"task_id": task_row.id, "eta_hours": task_row.eta_hours},
            )
            session.commit()
            return self._incident_from_row(self._load_incident_row(session, incident_id))

    def complete_task(self, incident_id: str, task_id: str) -> Incident:
        with db_database.SessionLocal() as session:
            incident_row = self._load_incident_row(session, incident_id)
            task_row = next((task for task in incident_row.tasks if task.id == task_id), None)
            if task_row is None:
                raise KeyError(task_id)

            task_row.status = "done"
            if all(task.status == "done" for task in incident_row.tasks):
                incident_row.status = "mitigation"
            incident_row.report_sections_json = None
            session.flush()
            self._record_activity(
                session,
                stage="verification",
                source="workflow",
                action="task_completed",
                title="Verification task completed",
                detail=f"{task_id} was marked done for {incident_id}.",
                actor=task_row.owner,
                incident_id=incident_id,
                entity_type="task",
                entity_id=task_id,
                metadata={"task_id": task_id, "status": "done"},
            )
            session.commit()
            return self._incident_from_row(self._load_incident_row(session, incident_id))

    def generate_report(self, incident_id: str) -> GenerateReportResponse:
        with db_database.SessionLocal() as session:
            incident_row = self._load_incident_row(session, incident_id)
            anomaly_row = self._load_anomaly_row(session, incident_row.anomaly_id)
            incident = self._incident_from_row(incident_row)
            incident.report_generated_at = self._now()
            report = self._build_report_sections(self._anomaly_from_row(anomaly_row), incident)

            incident_row.report_generated_at = incident.report_generated_at
            incident_row.report_sections_json = [section.model_dump() for section in report]
            session.flush()
            self._record_activity(
                session,
                stage="report",
                source="workflow",
                action="report_generated",
                title="MRV report generated",
                detail=f"{incident_id} now has an updated MRV summary for stakeholder review.",
                actor=incident_row.owner,
                incident_id=incident_id,
                entity_type="report",
                entity_id=f"{incident_id}-report",
                metadata={
                    "incident_id": incident_id,
                    "task_completion": f"{self._completed_tasks(incident_row)}/{len(incident_row.tasks)}",
                },
            )
            session.commit()
            return GenerateReportResponse(
                incident=self._incident_from_row(self._load_incident_row(session, incident_id)),
                report=report,
            )

    def export_report_html(
        self,
        incident_id: str,
        locale: Locale = "en",
        auto_print: bool = False,
    ) -> str:
        prepared = self._prepare_report_export(incident_id, locale)
        return render_html(prepared, auto_print=auto_print)

    def export_report_pdf(self, incident_id: str, locale: Locale = "en") -> bytes:
        return render_pdf(self._prepare_report_export(incident_id, locale))

    def export_report_docx(self, incident_id: str, locale: Locale = "en") -> bytes:
        return render_docx(self._prepare_report_export(incident_id, locale))

    def _prepare_report_export(self, incident_id: str, locale: Locale) -> PreparedReport:
        with db_database.SessionLocal() as session:
            incident_row = self._load_incident_row(session, incident_id)
            anomaly_row = self._load_anomaly_row(session, incident_row.anomaly_id)
            audit_events = [
                self._activity_from_row(row)
                for row in session.scalars(
                    select(ActivityEventRow)
                    .where(ActivityEventRow.incident_id == incident_id)
                    .order_by(desc(ActivityEventRow.db_id))
                ).all()
            ]
            return prepare_report(
                anomaly=self._anomaly_from_row(anomaly_row),
                incident=self._incident_from_row(incident_row),
                audit_events=audit_events,
                locale=locale,
            )

    def _save_pipeline_status(
        self,
        session,
        status: PipelineStatus,
        *,
        record_history: bool,
        record_activity: bool,
        sync_trigger: PipelineSyncTrigger,
    ) -> PipelineStatus:
        row = session.get(PipelineStateRow, self.PIPELINE_STATE_ID)
        snapshot = status.screening_snapshot or self._default_pipeline_status(status.project_id).screening_snapshot
        stage_payload = [stage.model_dump() for stage in status.stages]

        if row is None:
            row = PipelineStateRow(id=self.PIPELINE_STATE_ID)
            session.add(row)

        row.source = status.source
        row.state = status.state
        row.provider_label = status.provider_label
        row.project_id = status.project_id
        row.last_sync_at = status.last_sync_at
        row.latest_observation_at = status.latest_observation_at
        row.anomaly_count = status.anomaly_count
        row.status_message = status.status_message
        row.stages_json = stage_payload
        row.area_label = snapshot.area_label
        row.evidence_source = snapshot.evidence_source
        row.freshness = snapshot.freshness
        row.screening_level = snapshot.screening_level
        row.synced_at = snapshot.synced_at
        row.last_successful_sync_at = snapshot.last_successful_sync_at
        row.observed_window = snapshot.observed_window
        row.current_ch4_ppb = snapshot.current_ch4_ppb
        row.baseline_ch4_ppb = snapshot.baseline_ch4_ppb
        row.delta_abs_ppb = snapshot.delta_abs_ppb
        row.delta_pct = snapshot.delta_pct
        row.confidence_note = snapshot.confidence_note
        row.caveat = snapshot.caveat
        row.recommended_action = snapshot.recommended_action

        if record_history:
            session.add(
                PipelineSyncRunRow(
                    created_at=datetime.now(UTC),
                    sync_trigger=sync_trigger,
                    source=status.source,
                    state=status.state,
                    provider_label=status.provider_label,
                    project_id=status.project_id,
                    last_sync_at=status.last_sync_at,
                    latest_observation_at=status.latest_observation_at,
                    anomaly_count=status.anomaly_count,
                    status_message=status.status_message,
                    stages_json=stage_payload,
                    area_label=snapshot.area_label,
                    evidence_source=snapshot.evidence_source,
                    freshness=snapshot.freshness,
                    screening_level=snapshot.screening_level,
                    synced_at=snapshot.synced_at,
                    last_successful_sync_at=snapshot.last_successful_sync_at,
                    observed_window=snapshot.observed_window,
                    current_ch4_ppb=snapshot.current_ch4_ppb,
                    baseline_ch4_ppb=snapshot.baseline_ch4_ppb,
                    delta_abs_ppb=snapshot.delta_abs_ppb,
                    delta_pct=snapshot.delta_pct,
                    confidence_note=snapshot.confidence_note,
                    caveat=snapshot.caveat,
                    recommended_action=snapshot.recommended_action,
                )
            )

        if record_activity and status.state == "ready":
            self._record_activity(
                session,
                stage="ingest",
                source="gee",
                action="gee_sync_verified",
                title="Google Earth Engine sync verified",
                detail=status.status_message,
                actor="Earth Engine adapter",
                entity_type="pipeline",
                entity_id="gee-screening",
                metadata={
                    "project_id": status.project_id or "not reported",
                    "latest_observation_at": status.latest_observation_at or "not available",
                    "mean_ch4_ppb": snapshot.current_ch4_ppb
                    if snapshot.current_ch4_ppb is not None
                    else "not available",
                    "baseline_ch4_ppb": snapshot.baseline_ch4_ppb
                    if snapshot.baseline_ch4_ppb is not None
                    else "not available",
                    "delta_pct": snapshot.delta_pct if snapshot.delta_pct is not None else "not available",
                },
            )

        session.flush()
        return self._pipeline_status_from_state_row(row)

    def _record_activity(
        self,
        session,
        *,
        stage: str,
        source: str,
        action: str,
        title: str,
        detail: str,
        actor: str,
        incident_id: str | None = None,
        entity_type: str,
        entity_id: str | None = None,
        metadata: dict[str, str | int | float | bool | None] | None = None,
    ) -> None:
        session.add(
            ActivityEventRow(
                id=f"ACT-{uuid4().hex[:12]}",
                occurred_at=self._now(),
                stage=stage,
                source=source,
                action=action,
                title=title,
                detail=detail,
                actor=actor,
                incident_id=incident_id,
                entity_type=entity_type,
                entity_id=entity_id,
                metadata_json=metadata or {},
            )
        )

    def _load_incident_row(self, session, incident_id: str) -> IncidentRow:
        row = (
            session.execute(
                select(IncidentRow)
                .where(IncidentRow.id == incident_id)
                .options(joinedload(IncidentRow.tasks))
            )
            .unique()
            .scalar_one_or_none()
        )
        if row is None:
            raise KeyError(incident_id)
        return row

    def _load_anomaly_row(self, session, anomaly_id: str) -> AnomalyRow:
        row = session.get(AnomalyRow, anomaly_id)
        if row is None:
            raise KeyError(anomaly_id)
        return row

    def _load_snapshot_from_state(self, session) -> ScreeningEvidenceSnapshot | None:
        row = session.get(PipelineStateRow, self.PIPELINE_STATE_ID)
        if row is None:
            return None
        return self._snapshot_from_state_row(row)

    def _pipeline_status_from_state_row(self, row: PipelineStateRow) -> PipelineStatus:
        return PipelineStatus(
            source=row.source,  # type: ignore[arg-type]
            state=row.state,  # type: ignore[arg-type]
            provider_label=row.provider_label,
            project_id=row.project_id,
            last_sync_at=row.last_sync_at,
            latest_observation_at=row.latest_observation_at,
            anomaly_count=row.anomaly_count,
            status_message=row.status_message,
            stages=[PipelineStage(**stage) for stage in row.stages_json],
            screening_snapshot=self._snapshot_from_state_row(row),
        )

    def _pipeline_status_from_sync_run_row(self, row: PipelineSyncRunRow) -> PipelineStatus:
        return PipelineStatus(
            source=row.source,  # type: ignore[arg-type]
            state=row.state,  # type: ignore[arg-type]
            provider_label=row.provider_label,
            project_id=row.project_id,
            last_sync_at=row.last_sync_at,
            latest_observation_at=row.latest_observation_at,
            anomaly_count=row.anomaly_count,
            status_message=row.status_message,
            stages=[PipelineStage(**stage) for stage in row.stages_json],
            screening_snapshot=ScreeningEvidenceSnapshot(
                area_label=row.area_label,
                evidence_source=row.evidence_source,
                freshness=row.freshness,  # type: ignore[arg-type]
                screening_level=row.screening_level,  # type: ignore[arg-type]
                synced_at=row.synced_at,
                last_successful_sync_at=row.last_successful_sync_at,
                observed_window=row.observed_window,
                current_ch4_ppb=row.current_ch4_ppb,
                baseline_ch4_ppb=row.baseline_ch4_ppb,
                delta_abs_ppb=row.delta_abs_ppb,
                delta_pct=row.delta_pct,
                confidence_note=row.confidence_note,
                caveat=row.caveat,
                recommended_action=row.recommended_action,
            ),
        )

    def _snapshot_from_state_row(self, row: PipelineStateRow) -> ScreeningEvidenceSnapshot:
        return ScreeningEvidenceSnapshot(
            area_label=row.area_label,
            evidence_source=row.evidence_source,
            freshness=row.freshness,  # type: ignore[arg-type]
            screening_level=row.screening_level,  # type: ignore[arg-type]
            synced_at=row.synced_at,
            last_successful_sync_at=row.last_successful_sync_at,
            observed_window=row.observed_window,
            current_ch4_ppb=row.current_ch4_ppb,
            baseline_ch4_ppb=row.baseline_ch4_ppb,
            delta_abs_ppb=row.delta_abs_ppb,
            delta_pct=row.delta_pct,
            confidence_note=row.confidence_note,
            caveat=row.caveat,
            recommended_action=row.recommended_action,
        )

    def _anomaly_from_row(self, row: AnomalyRow) -> Anomaly:
        return Anomaly(
            id=row.id,
            asset_name=row.asset_name,
            region=row.region,
            facility_type=row.facility_type,
            severity=row.severity,
            detected_at=row.detected_at,
            methane_delta_pct=row.methane_delta_pct,
            methane_delta_ppb=row.methane_delta_ppb,
            co2e_tonnes=row.co2e_tonnes,
            flare_hours=row.flare_hours,
            thermal_hits_72h=row.thermal_hits_72h,
            night_thermal_hits_72h=row.night_thermal_hits_72h,
            current_ch4_ppb=row.current_ch4_ppb,
            baseline_ch4_ppb=row.baseline_ch4_ppb,
            evidence_source=row.evidence_source,
            baseline_window=row.baseline_window,
            signal_score=row.signal_score,
            confidence=row.confidence,
            coordinates=row.coordinates,
            latitude=row.latitude,
            longitude=row.longitude,
            verification_area=row.verification_area,
            nearest_address=row.nearest_address,
            nearest_landmark=row.nearest_landmark,
            summary=row.summary,
            recommended_action=row.recommended_action,
            site_position=SitePosition(x=row.site_x, y=row.site_y),
            trend=[TrendPoint(**point) for point in row.trend_json],
            linked_incident_id=row.linked_incident_id,
        )

    def _incident_from_row(self, row: IncidentRow) -> Incident:
        return Incident(
            id=row.id,
            anomaly_id=row.anomaly_id,
            title=row.title,
            status=row.status,  # type: ignore[arg-type]
            owner=row.owner,
            priority=row.priority,
            verification_window=row.verification_window,
            report_generated_at=row.report_generated_at,
            narrative=row.narrative,
            tasks=[
                IncidentTask(
                    id=task.id,
                    title=task.title,
                    owner=task.owner,
                    eta_hours=task.eta_hours,
                    status=task.status,  # type: ignore[arg-type]
                    notes=task.notes,
                )
                for task in row.tasks
            ],
            report_sections=(
                [ReportSection(**section) for section in row.report_sections_json]
                if row.report_sections_json
                else None
            ),
        )

    def _activity_from_row(self, row: ActivityEventRow) -> ActivityEvent:
        return ActivityEvent(
            id=row.id,
            occurred_at=row.occurred_at,
            stage=row.stage,  # type: ignore[arg-type]
            source=row.source,  # type: ignore[arg-type]
            action=row.action,  # type: ignore[arg-type]
            title=row.title,
            detail=row.detail,
            actor=row.actor,
            incident_id=row.incident_id,
            entity_type=row.entity_type,  # type: ignore[arg-type]
            entity_id=row.entity_id,
            metadata=row.metadata_json or {},
        )

    def _build_report_sections(self, anomaly, incident: Incident) -> list[ReportSection]:
        measurement_body = self._live_measurement_summary(anomaly)
        reporting_body = self._live_progress_summary(anomaly, incident)
        next_step_body = (
            f"{anomaly.recommended_action} Verification window: {incident.verification_window}."
            if anomaly.recommended_action
            else f"Continue verification under the {incident.verification_window.lower()} response window."
        )
        return [
            ReportSection(title="Screening finding", body=measurement_body),
            ReportSection(title="Case status", body=reporting_body),
            ReportSection(
                title="Next step",
                body=next_step_body,
            ),
        ]

    def _build_live_kpis(self, anomalies: list, latest_observation_at: str | None) -> list[KpiCard]:
        if not anomalies:
            return [
                KpiCard(label="Live candidates", value="0", detail="No live CH4 hotspot candidate passed the current threshold."),
                KpiCard(label="Strongest uplift", value="Not available", detail="Run another sync when a valid scene is available."),
                KpiCard(label="Night thermal context", value="0 detections", detail="No recent VIIRS night detections were linked to the current live queue."),
                KpiCard(label="Latest scene", value=latest_observation_at or "Not available", detail="Most recent valid TROPOMI observation used in the live queue."),
            ]

        strongest = max(anomalies, key=lambda anomaly: anomaly.signal_score)
        unique_regions = sorted({anomaly.region for anomaly in anomalies})
        total_night_hits = sum(anomaly.night_thermal_hits_72h or 0 for anomaly in anomalies)
        strongest_value = (
            f"{strongest.methane_delta_ppb:.2f} ppb / {strongest.methane_delta_pct:.2f}%"
            if strongest.methane_delta_ppb is not None
            else f"{strongest.methane_delta_pct:.2f}%"
        )
        return [
            KpiCard(label="Live candidates", value=str(len(anomalies)), detail=f"{len(unique_regions)} Kazakhstan regions in the current live screening queue"),
            KpiCard(label="Strongest uplift", value=strongest_value, detail=f"Top live hotspot: {strongest.asset_name}"),
            KpiCard(label="Night thermal context", value=f"{total_night_hits} detections", detail="VIIRS night-time thermal detections inside 25 km candidate buffers over the last 72 hours"),
            KpiCard(label="Latest scene", value=latest_observation_at or "Not available", detail="Most recent valid TROPOMI observation used in the live queue"),
        ]

    def _candidate_site_position(self, latitude: float, longitude: float) -> SitePosition:
        west, south, east, north = 46.0, 40.0, 87.0, 56.0
        normalized_x = round(((longitude - west) / (east - west)) * 100)
        normalized_y = round((1 - ((latitude - south) / (north - south))) * 100)
        return SitePosition(x=max(0, min(100, normalized_x)), y=max(0, min(100, normalized_y)))

    def _point_wkt(self, latitude: float, longitude: float) -> str:
        return f"POINT({longitude} {latitude})"

    def _point_geometry_value(self, dialect_name: str, latitude: float, longitude: float) -> str | WKTElement:
        point_wkt = self._point_wkt(latitude, longitude)
        if dialect_name == "postgresql":
            return WKTElement(point_wkt, srid=4326)
        return point_wkt

    def _live_measurement_summary(self, anomaly) -> str:
        thermal_note = (
            f"{anomaly.night_thermal_hits_72h} night-time VIIRS detections"
            if anomaly.night_thermal_hits_72h
            else "no night-time VIIRS detections"
        )
        location_tail = ""
        if anomaly.verification_area:
            location_tail = f" Verification area: {anomaly.verification_area}."
        if anomaly.nearest_landmark:
            location_tail += f" Nearest landmark: {anomaly.nearest_landmark}."
        return (
            f"Live screening flagged {anomaly.asset_name} in {anomaly.region} with "
            f"+{anomaly.methane_delta_ppb:.2f} ppb ({anomaly.methane_delta_pct:.2f}%) methane uplift "
            f"versus the rolling baseline and {thermal_note} inside the 25 km context window."
            f"{location_tail}"
        )

    def _live_progress_summary(self, anomaly, incident: Incident) -> str:
        return (
            f"{self._completed_tasks(incident)}/{len(incident.tasks)} verification tasks are complete. "
            f"{incident.owner} owns the case under {incident.priority} priority with a {incident.verification_window.lower()} window. "
            f"The case remains ranked by methane uplift and nearby thermal context."
        )

    def _completed_tasks(self, incident: Incident | IncidentRow) -> int:
        return len([task for task in incident.tasks if task.status == "done"])


DemoStore = WorkflowStore
