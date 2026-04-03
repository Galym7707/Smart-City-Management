from __future__ import annotations

from datetime import UTC, datetime
from threading import Lock

from app.models import PipelineStage, PipelineStatus, PipelineSyncTrigger
from app.providers.gee import GeeProvider
from app.services.workflow_store import WorkflowStore


class PipelineService:
    def __init__(self, store: WorkflowStore) -> None:
        self.store = store
        self.provider = GeeProvider()
        self._sync_lock = Lock()

    def get_status(self) -> PipelineStatus:
        return self.store.get_pipeline_status(self.provider.project_id)

    def sync_gee(self, trigger: PipelineSyncTrigger = "manual") -> PipelineStatus:
        if not self._sync_lock.acquire(blocking=False):
            current = self.get_status()
            return PipelineStatus(
                source=current.source,
                state="syncing",
                provider_label=current.provider_label,
                project_id=current.project_id,
                last_sync_at=current.last_sync_at,
                latest_observation_at=current.latest_observation_at,
                anomaly_count=current.anomaly_count,
                status_message="Live Earth Engine sync already in progress.",
                stages=current.stages,
                screening_snapshot=current.screening_snapshot,
            )

        try:
            return self._sync_gee_locked(trigger)
        finally:
            self._sync_lock.release()

    def _sync_gee_locked(self, trigger: PipelineSyncTrigger) -> PipelineStatus:
        now = self._now()
        summary = self.provider.sync_summary()

        if summary.status == "ready":
            snapshot = self.store.apply_fresh_screening_evidence(
                synced_at=now,
                project_id=summary.project_id,
                observed_window=summary.observed_window,
                latest_observation_at=summary.latest_observation_at,
                mean_ch4_ppb=summary.mean_ch4_ppb,
                baseline_ch4_ppb=summary.baseline_ch4_ppb,
                delta_abs_ppb=summary.delta_abs_ppb,
                delta_pct=summary.delta_pct,
                screening_level=self._screening_level(summary.delta_pct),
                status_message=summary.message,
            )
            self.store.apply_live_candidates(
                candidates=summary.candidates,
                latest_observation_at=summary.latest_observation_at,
            )
            mean_fragment = (
                f"Current CH4 {summary.mean_ch4_ppb} ppb vs baseline {summary.baseline_ch4_ppb} ppb."
                if summary.mean_ch4_ppb is not None and summary.baseline_ch4_ppb is not None
                else "Latest CH4 scene fetched successfully."
            )
            status_model = PipelineStatus(
                source="gee",
                state="ready",
                provider_label="Google Earth Engine",
                project_id=summary.project_id,
                last_sync_at=now,
                latest_observation_at=summary.latest_observation_at,
                anomaly_count=len(summary.candidates),
                status_message=summary.message,
                stages=[
                    PipelineStage(
                        label="Ingest layer",
                        value="Earth Engine connected",
                        detail=summary.latest_observation_at
                        and f"Latest CH4 scene timestamp: {summary.latest_observation_at}."
                        or "Latest CH4 scene fetched successfully.",
                    ),
                    PipelineStage(
                        label="Normalization layer",
                        value="Live candidates refreshed",
                        detail=f"{mean_fragment} {len(summary.candidates)} live candidates were pushed into the operational queue.",
                    ),
                    PipelineStage(
                        label="Verification layer",
                        value="Promotion remains manual",
                        detail="Live screening candidates now feed the queue, while incident, task, and MRV workflow remain manually promoted and auditable.",
                    ),
                ],
                screening_snapshot=snapshot,
            )
            return self.store.save_pipeline_status(status_model, sync_trigger=trigger)

        degraded_state = "degraded" if summary.status == "degraded" else "error"
        snapshot = (
            self.store.mark_screening_stale(synced_at=now, caveat=summary.message)
            if summary.status == "degraded"
            else self.store.mark_screening_unavailable(synced_at=now, caveat=summary.message)
        )
        normalization_detail = (
            "The last verified live screening snapshot remains visible while the next live refresh is unavailable."
            if snapshot.last_successful_sync_at
            else "No verified live screening snapshot is stored yet, so the queue stays empty until a live sync succeeds."
        )
        status_model = PipelineStatus(
            source="gee",
            state=degraded_state,
            provider_label="Google Earth Engine",
            project_id=summary.project_id,
            last_sync_at=now,
            latest_observation_at=summary.latest_observation_at,
            anomaly_count=len(self.store.anomalies),
            status_message=summary.message,
            stages=[
                    PipelineStage(
                        label="Ingest layer",
                        value="Earth Engine not fully verified",
                        detail=summary.message,
                    ),
                    PipelineStage(
                        label="Normalization layer",
                        value="Waiting for verified live evidence",
                        detail=normalization_detail,
                    ),
                    PipelineStage(
                        label="Verification layer",
                        value="Workflow preserved",
                        detail="Existing incidents and reports remain accessible even if a new live sync fails.",
                    ),
                ],
                screening_snapshot=snapshot,
            )
        return self.store.save_pipeline_status(status_model, sync_trigger=trigger)

    def _now(self) -> str:
        return datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    def _screening_level(self, delta_pct: float | None) -> str:
        if delta_pct is None:
            return "medium"
        if delta_pct >= 10:
            return "high"
        if delta_pct >= 3:
            return "medium"
        return "low"
