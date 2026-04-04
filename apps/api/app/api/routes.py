from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from app.models import (
    ActivityFeedPayload,
    Anomaly,
    CrimeIncident,
    CrimeMonitorSnapshot,
    CreateTaskRequest,
    DashboardPayload,
    GenerateReportResponse,
    Incident,
    PipelineHistoryPayload,
    PipelineStatus,
    PipelineSyncRequest,
    PipelineSyncResponse,
    PromoteAnomalyRequest,
)
from app.services.crime_monitor import get_crime_incident, get_crime_snapshot, get_crime_video_path
from app.services.pipeline_scheduler import PipelineScheduler
from app.services.workflow_store import WorkflowStore
from app.services.pipeline_service import PipelineService

router = APIRouter(prefix="/api/v1", tags=["mrv"])
store = WorkflowStore()
pipeline_service = PipelineService(store)
pipeline_scheduler = PipelineScheduler(pipeline_service)


def replace_runtime_services(next_store: WorkflowStore | None = None) -> None:
    global store, pipeline_service, pipeline_scheduler

    pipeline_scheduler.shutdown()
    store = next_store or WorkflowStore()
    pipeline_service = PipelineService(store)
    pipeline_scheduler = PipelineScheduler(pipeline_service)


@router.get("/dashboard", response_model=DashboardPayload)
async def get_dashboard() -> DashboardPayload:
    return store.dashboard()


@router.get("/activity", response_model=ActivityFeedPayload)
async def get_activity_feed() -> ActivityFeedPayload:
    return ActivityFeedPayload(events=store.list_activity())


@router.get("/pipeline/status", response_model=PipelineStatus)
async def get_pipeline_status() -> PipelineStatus:
    return pipeline_service.get_status()


@router.get("/pipeline/history", response_model=PipelineHistoryPayload)
async def get_pipeline_history(limit: int = 10) -> PipelineHistoryPayload:
    return PipelineHistoryPayload(
        runs=store.list_pipeline_history(limit=limit),
        schedule=pipeline_scheduler.status(),
    )


@router.get("/crime/incidents", response_model=CrimeMonitorSnapshot)
async def get_crime_monitor() -> CrimeMonitorSnapshot:
    return get_crime_snapshot()


@router.get("/crime/incidents/{incident_id}", response_model=CrimeIncident)
async def get_crime_incident_detail(incident_id: int) -> CrimeIncident:
    incident = get_crime_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Unknown crime incident {incident_id}")
    return incident


@router.get("/crime/incidents/{incident_id}/video")
async def get_crime_incident_video(incident_id: int) -> FileResponse:
    video_path = get_crime_video_path(incident_id)
    if video_path is None:
        raise HTTPException(status_code=404, detail=f"Video unavailable for crime incident {incident_id}")

    return FileResponse(
        path=video_path,
        media_type="video/quicktime",
        filename=video_path.name,
    )


@router.post("/pipeline/sync", response_model=PipelineSyncResponse)
async def sync_pipeline(payload: PipelineSyncRequest) -> PipelineSyncResponse:
    status_model = await run_in_threadpool(pipeline_service.sync_gee)
    return PipelineSyncResponse(status=status_model)


@router.get("/anomalies", response_model=list[Anomaly])
async def list_anomalies() -> list[Anomaly]:
    return store.list_anomalies()


@router.post(
    "/anomalies/{anomaly_id}/promote",
    response_model=Incident,
    status_code=status.HTTP_201_CREATED,
)
async def promote_anomaly(anomaly_id: str, payload: PromoteAnomalyRequest) -> Incident:
    try:
        return store.promote_anomaly(anomaly_id, payload)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown anomaly {anomaly_id}") from error


@router.get("/incidents", response_model=list[Incident])
async def list_incidents() -> list[Incident]:
    return store.list_incidents()


@router.get("/incidents/{incident_id}", response_model=Incident)
async def get_incident(incident_id: str) -> Incident:
    try:
        return store.get_incident(incident_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error


@router.get("/incidents/{incident_id}/audit", response_model=ActivityFeedPayload)
async def get_incident_audit(incident_id: str) -> ActivityFeedPayload:
    try:
        return ActivityFeedPayload(events=store.list_incident_activity(incident_id))
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error


@router.post("/incidents/{incident_id}/tasks", response_model=Incident)
async def create_task(incident_id: str, payload: CreateTaskRequest) -> Incident:
    try:
        return store.create_task(incident_id, payload)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error


@router.post("/incidents/{incident_id}/tasks/{task_id}/complete", response_model=Incident)
async def complete_task(incident_id: str, task_id: str) -> Incident:
    try:
        return store.complete_task(incident_id, task_id)
    except KeyError as error:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown incident or task: {incident_id} / {task_id}",
        ) from error


@router.post("/incidents/{incident_id}/report", response_model=GenerateReportResponse)
async def generate_report(incident_id: str) -> GenerateReportResponse:
    try:
        return store.generate_report(incident_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error


@router.get("/incidents/{incident_id}/report/export")
async def export_report(
    incident_id: str,
    format: Literal["html", "pdf", "docx"] = "html",
    locale: Literal["en", "ru"] = "en",
) -> Response:
    try:
        if format == "pdf":
            content = store.export_report_pdf(incident_id, locale=locale)
            media_type = "application/pdf"
            extension = "pdf"
        elif format == "docx":
            content = store.export_report_docx(incident_id, locale=locale)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            extension = "docx"
        else:
            content = store.export_report_html(incident_id, locale=locale)
            media_type = "text/html; charset=utf-8"
            extension = "html"
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{incident_id.lower()}-mrv-report.{extension}"',
        },
    )


@router.get("/incidents/{incident_id}/report/view")
async def view_report(
    incident_id: str,
    auto_print: bool = False,
    locale: Literal["en", "ru"] = "en",
) -> Response:
    try:
        report_html = store.export_report_html(incident_id, locale=locale, auto_print=auto_print)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown incident {incident_id}") from error

    return Response(
        content=report_html,
        media_type="text/html; charset=utf-8",
    )
