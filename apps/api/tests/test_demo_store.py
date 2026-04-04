from app.models import PipelineStage, PipelineStatus, PromoteAnomalyRequest
from app.providers.gee import GeeCandidate
from app.services.workflow_store import WorkflowStore


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


def test_promote_anomaly_records_measurement_and_incident_activity() -> None:
    store = WorkflowStore()
    candidate = make_live_candidate()
    store.apply_live_candidates(candidates=[candidate], latest_observation_at=candidate.detected_at)

    incident = store.promote_anomaly(candidate.id, PromoteAnomalyRequest(owner="ESG desk"))
    incident_events = store.list_incident_activity(incident.id)

    assert incident.id == "INC-20260327-01"
    assert incident_events[0].action == "anomaly_promoted"
    assert incident_events[1].action == "screening_loaded"
    assert incident_events[1].source == "gee"
    assert incident_events[1].entity_type == "anomaly"


def test_live_candidates_expose_numeric_geolocation() -> None:
    store = WorkflowStore()
    candidate = make_live_candidate()
    store.apply_live_candidates(candidates=[candidate], latest_observation_at=candidate.detected_at)

    anomalies = store.list_anomalies()

    assert len(anomalies) == 1
    assert isinstance(anomalies[0].latitude, float)
    assert isinstance(anomalies[0].longitude, float)
    assert anomalies[0].region == "Atyrau Region"
    assert anomalies[0].latitude == 46.19
    assert anomalies[0].longitude == 51.858


def test_generate_report_and_export_html_include_audit_timeline() -> None:
    store = WorkflowStore()
    candidate = make_live_candidate()
    store.apply_live_candidates(candidates=[candidate], latest_observation_at=candidate.detected_at)
    incident = store.promote_anomaly(candidate.id, PromoteAnomalyRequest(owner="ESG desk"))

    generated = store.generate_report(incident.id)
    report_html = store.export_report_html(incident.id)

    assert len(generated.report) == 3
    assert "Audit Timeline" in report_html
    assert f"Saryna MRV Report: {incident.id}" in report_html
    assert "MRV report generated" in report_html
    assert generated.report[0].title == "Screening finding"
    assert generated.report[2].title == "Next step"


def test_mark_screening_unavailable_preserves_last_verified_snapshot() -> None:
    store = WorkflowStore()

    snapshot = store.apply_fresh_screening_evidence(
        synced_at="2026-03-27 08:05 UTC",
        project_id="demo-project",
        observed_window="Latest TROPOMI scene compared with Kazakhstan historical mean.",
        latest_observation_at="2026-03-27 08:00 UTC",
        mean_ch4_ppb=1892.4,
        baseline_ch4_ppb=1831.1,
        delta_abs_ppb=61.3,
        delta_pct=3.35,
        screening_level="medium",
        status_message="Earth Engine CH4 screening summary fetched successfully.",
    )
    store.save_pipeline_status(
        PipelineStatus(
            source="gee",
            state="ready",
            provider_label="Google Earth Engine",
            project_id="demo-project",
            last_sync_at="2026-03-27 08:05 UTC",
            latest_observation_at="2026-03-27 08:00 UTC",
            anomaly_count=0,
            status_message="Earth Engine CH4 screening summary fetched successfully.",
            stages=[
                PipelineStage(label="Ingest layer", value="Earth Engine connected", detail="Latest CH4 scene fetched successfully."),
                PipelineStage(label="Normalization layer", value="Live candidates refreshed", detail="0 live candidates were pushed into the operational queue."),
                PipelineStage(label="Verification layer", value="Promotion remains manual", detail="Workflow remains ready."),
            ],
            screening_snapshot=snapshot,
        )
    )

    stale_snapshot = store.mark_screening_unavailable(
        synced_at="2026-03-27 08:40 UTC",
        caveat="Earth Engine query failed.",
    )

    assert stale_snapshot.freshness == "unavailable"
    assert stale_snapshot.evidence_source == "Google Earth Engine / Sentinel-5P"
    assert stale_snapshot.last_successful_sync_at == "2026-03-27 08:05 UTC"
    assert any(event.source == "gee" for event in store.dashboard().activity_feed)
