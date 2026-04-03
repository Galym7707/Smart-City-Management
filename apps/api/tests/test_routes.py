from io import BytesIO

from docx import Document
from fastapi.testclient import TestClient

from app.api import routes
from app.main import app
from app.models import CreateTaskRequest
from app.providers.gee import GeeCandidate, GeeSyncSummary
from app.services.workflow_store import WorkflowStore


def make_client() -> TestClient:
    routes.replace_runtime_services(WorkflowStore())
    return TestClient(app)


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


def sync_live_candidate(client: TestClient) -> str:
    routes.pipeline_service.provider.sync_summary = lambda: GeeSyncSummary(
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
    sync_response = client.post("/api/v1/pipeline/sync", json={"source": "gee"})
    assert sync_response.status_code == 200
    dashboard = client.get("/api/v1/dashboard")
    assert dashboard.status_code == 200
    return dashboard.json()["anomalies"][0]["id"]


def test_health_and_dashboard_contract() -> None:
    client = make_client()

    health = client.get("/health")
    dashboard = client.get("/api/v1/dashboard")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert len(payload["kpis"]) == 4
    assert payload["anomalies"] == []
    assert payload["incidents"] == []
    assert payload["activity_feed"] == []


def test_pipeline_sync_handles_provider_error_with_typed_response() -> None:
    client = make_client()
    routes.pipeline_service.provider.sync_summary = lambda: GeeSyncSummary(
        project_id="demo-project",
        status="error",
        message="Earth Engine initialization failed.",
    )

    response = client.post("/api/v1/pipeline/sync", json={"source": "gee"})

    assert response.status_code == 200
    payload = response.json()["status"]
    assert payload["source"] == "gee"
    assert payload["state"] == "error"
    assert payload["provider_label"] == "Google Earth Engine"
    assert payload["project_id"] == "demo-project"
    assert payload["screening_snapshot"]["freshness"] == "unavailable"
    assert payload["screening_snapshot"]["evidence_source"] == "Google Earth Engine / Sentinel-5P"
    assert payload["screening_snapshot"]["current_ch4_ppb"] is None
    assert payload["screening_snapshot"]["last_successful_sync_at"] is None


def test_pipeline_sync_ready_keeps_manual_promote_path_intact() -> None:
    client = make_client()
    live_anomaly_id = sync_live_candidate(client)
    history_response = client.get("/api/v1/pipeline/history")

    dashboard_after_sync = client.get("/api/v1/dashboard")
    promote_response = client.post(
        f"/api/v1/anomalies/{live_anomaly_id}/promote",
        json={"owner": "ESG desk"},
    )

    live_anomaly = dashboard_after_sync.json()["anomalies"][0]
    assert history_response.status_code == 200
    assert history_response.json()["schedule"]["enabled"] is False
    assert history_response.json()["runs"][0]["trigger"] == "manual"
    assert history_response.json()["runs"][0]["status"]["state"] == "ready"
    assert live_anomaly["verification_area"] == "Makat District, Atyrau Region"
    assert live_anomaly["nearest_address"] == "A27, Atyrau Region"
    assert live_anomaly["nearest_landmark"] == "Tengiz Field"
    assert promote_response.status_code == 201
    assert promote_response.json()["anomaly_id"] == live_anomaly_id
    assert promote_response.json()["id"] == "INC-20260327-01"


def test_incident_task_report_flow_preserves_audit_contract() -> None:
    client = make_client()
    live_anomaly_id = sync_live_candidate(client)

    promote = client.post(f"/api/v1/anomalies/{live_anomaly_id}/promote", json={"owner": "ESG desk"})
    incident = promote.json()
    incident_id = incident["id"]

    created = client.post(
        f"/api/v1/incidents/{incident_id}/tasks",
        json=CreateTaskRequest(
            title="Collect operator comment",
            owner="ESG lead",
            eta_hours=3,
            notes="Needed for MRV note.",
        ).model_dump(),
    )
    created_task_ids = [task["id"] for task in created.json()["tasks"] if task["status"] == "open"]

    for task_id in created_task_ids:
        completed = client.post(f"/api/v1/incidents/{incident_id}/tasks/{task_id}/complete")
        assert completed.status_code == 200

    report = client.post(f"/api/v1/incidents/{incident_id}/report")
    audit = client.get(f"/api/v1/incidents/{incident_id}/audit")
    export = client.get(f"/api/v1/incidents/{incident_id}/report/export")

    assert promote.status_code == 201
    assert created.status_code == 200
    assert report.status_code == 200
    assert audit.status_code == 200
    assert export.status_code == 200
    assert report.json()["incident"]["status"] == "mitigation"
    assert any(event["action"] == "report_generated" for event in audit.json()["events"])
    assert "Audit Timeline" in export.text


def test_report_export_supports_html_pdf_and_docx() -> None:
    client = make_client()
    live_anomaly_id = sync_live_candidate(client)
    promote = client.post(f"/api/v1/anomalies/{live_anomaly_id}/promote", json={"owner": "ESG desk"})
    incident_id = promote.json()["id"]

    report = client.post(f"/api/v1/incidents/{incident_id}/report")
    assert report.status_code == 200

    html = client.get(f"/api/v1/incidents/{incident_id}/report/export?format=html&locale=ru")
    pdf = client.get(f"/api/v1/incidents/{incident_id}/report/export?format=pdf&locale=ru")
    docx = client.get(f"/api/v1/incidents/{incident_id}/report/export?format=docx&locale=ru")

    assert html.status_code == 200
    assert pdf.status_code == 200
    assert docx.status_code == 200

    assert "Отчет Saryna MRV" in html.text
    assert "Итог по кейсу" in html.text
    assert (
        f'attachment; filename="{incident_id.lower()}-mrv-report.pdf"'
        in pdf.headers["content-disposition"]
    )
    assert pdf.content.startswith(b"%PDF")
    assert (
        f'attachment; filename="{incident_id.lower()}-mrv-report.docx"'
        in docx.headers["content-disposition"]
    )
    assert docx.content.startswith(b"PK")

    document = Document(BytesIO(docx.content))
    full_text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert "Отчет Saryna MRV" in full_text
    assert "Итог по кейсу" in full_text
