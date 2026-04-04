from app.providers.gee import GeeCandidate, GeeSyncSummary
from app.services.workflow_store import WorkflowStore
from app.services.pipeline_service import PipelineService


def make_live_candidate() -> GeeCandidate:
    return GeeCandidate(
        id="GEE-20260327-01",
        asset_name="Atyrau Region CH4 hotspot 01",
        region="Atyrau Region",
        facility_type="Methane hotspot with night thermal context",
        severity="high",
        detected_at="2026-03-27 08:00",
        methane_delta_pct=3.41,
        methane_delta_ppb=62.2,
        signal_score=82,
        confidence="High screening confidence / methane uplift plus night thermal context",
        coordinates="46.190 N, 51.858 E",
        latitude=46.19,
        longitude=51.858,
        summary="Live candidate summary",
        recommended_action="Promote this candidate into an incident and send it to field verification.",
        current_ch4_ppb=1884.6,
        baseline_ch4_ppb=1822.4,
        thermal_hits_72h=12,
        night_thermal_hits_72h=12,
        evidence_source="Google Earth Engine / Sentinel-5P + VIIRS thermal context",
        baseline_window="84-day Kazakhstan baseline before 2026-03-27 08:00 UTC",
        verification_area="Makat District, Atyrau Region",
        nearest_address="A27, Atyrau Region",
        nearest_landmark="Tengiz Field",
    )


def test_initial_status_waits_for_first_live_sync() -> None:
    store = WorkflowStore()
    service = PipelineService(store)
    status_model = service.get_status()

    assert status_model.source == "gee"
    assert status_model.state == "degraded"
    assert status_model.project_id == service.provider.project_id
    assert status_model.anomaly_count == 0
    assert status_model.screening_snapshot is not None
    assert status_model.screening_snapshot.freshness == "unavailable"


def test_sync_gee_ready_updates_pipeline_and_store() -> None:
    store = WorkflowStore()
    service = PipelineService(store)
    service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="ready",
        message="Earth Engine CH4 screening summary fetched successfully.",
        latest_observation_at="2026-03-27 08:00 UTC",
        observed_window="Latest TROPOMI scene compared with Kazakhstan historical mean.",
        mean_ch4_ppb=1884.6,
        baseline_ch4_ppb=1822.4,
        delta_abs_ppb=62.2,
        delta_pct=3.41,
        scene_count=12,
        candidates=[make_live_candidate()],
    )

    status_model = service.sync_gee()
    strongest = max(store.list_anomalies(), key=lambda anomaly: anomaly.signal_score)
    snapshot = status_model.screening_snapshot

    assert status_model.source == "gee"
    assert status_model.state == "ready"
    assert status_model.project_id == "demo-project"
    assert snapshot is not None
    assert snapshot.freshness == "fresh"
    assert snapshot.current_ch4_ppb == 1884.6
    assert snapshot.baseline_ch4_ppb == 1822.4
    assert strongest.id == "GEE-20260327-01"
    assert strongest.evidence_source == "Google Earth Engine / Sentinel-5P + VIIRS thermal context"
    assert strongest.co2e_tonnes is None
    assert strongest.night_thermal_hits_72h == 12
    assert strongest.verification_area == "Makat District, Atyrau Region"
    assert strongest.nearest_address == "A27, Atyrau Region"
    assert strongest.nearest_landmark == "Tengiz Field"
    assert store.list_pipeline_history()[0].trigger == "manual"


def test_sync_gee_error_keeps_empty_state_before_first_success() -> None:
    store = WorkflowStore()
    service = PipelineService(store)
    service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="error",
        message="Earth Engine initialization failed.",
    )

    status_model = service.sync_gee()
    snapshot = status_model.screening_snapshot

    assert status_model.source == "gee"
    assert status_model.state == "error"
    assert snapshot is not None
    assert snapshot.freshness == "unavailable"
    assert snapshot.evidence_source == "Google Earth Engine / Sentinel-5P"
    assert snapshot.current_ch4_ppb is None
    assert snapshot.last_successful_sync_at is None
    assert len(store.dashboard().anomalies) == 0
    assert all(event.source != "gee" for event in store.dashboard().activity_feed)


def test_sync_gee_degraded_preserves_previous_live_snapshot_when_available() -> None:
    store = WorkflowStore()
    service = PipelineService(store)
    service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="ready",
        message="Earth Engine CH4 screening summary fetched successfully.",
        latest_observation_at="2026-03-27 08:00 UTC",
        observed_window="Latest TROPOMI scene compared with Kazakhstan historical mean.",
        mean_ch4_ppb=1884.6,
        baseline_ch4_ppb=1822.4,
        delta_abs_ppb=62.2,
        delta_pct=3.41,
        scene_count=12,
        candidates=[],
    )
    first_status = service.sync_gee()
    service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="degraded",
        message="Earth Engine returned no fresh scene for the selected window.",
    )

    status_model = service.sync_gee()
    snapshot = status_model.screening_snapshot

    assert status_model.state == "degraded"
    assert snapshot is not None
    assert snapshot.freshness == "stale"
    assert snapshot.current_ch4_ppb == 1884.6
    assert snapshot.last_successful_sync_at == first_status.last_sync_at


def test_scheduled_sync_records_scheduled_trigger() -> None:
    store = WorkflowStore()
    service = PipelineService(store)
    service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="ready",
        message="Earth Engine CH4 screening summary fetched successfully.",
        latest_observation_at="2026-03-27 08:00 UTC",
        observed_window="Latest TROPOMI scene compared with Kazakhstan historical mean.",
        mean_ch4_ppb=1884.6,
        baseline_ch4_ppb=1822.4,
        delta_abs_ppb=62.2,
        delta_pct=3.41,
        scene_count=12,
        candidates=[make_live_candidate()],
    )

    service.sync_gee(trigger="scheduled")

    assert store.list_pipeline_history()[0].trigger == "scheduled"
