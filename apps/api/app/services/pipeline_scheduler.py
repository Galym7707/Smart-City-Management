from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app.models import PipelineScheduleStatus
from app.services.pipeline_service import PipelineService

logger = logging.getLogger(__name__)


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


class PipelineScheduler:
    JOB_ID = "gee-auto-sync"

    def __init__(self, pipeline_service: PipelineService) -> None:
        self.pipeline_service = pipeline_service
        self.enabled = _env_flag("PIPELINE_AUTO_SYNC_ENABLED", True)
        self.interval_minutes = max(30, int(os.getenv("PIPELINE_AUTO_SYNC_INTERVAL_MINUTES", "360")))
        self.run_on_startup = _env_flag("PIPELINE_AUTO_SYNC_RUN_ON_STARTUP", False)
        self._scheduler: BackgroundScheduler | None = None

    def start(self) -> None:
        if not self.enabled or self._scheduler is not None:
            return

        scheduler = BackgroundScheduler(
            timezone="UTC",
            daemon=True,
            job_defaults={"coalesce": True, "max_instances": 1},
        )
        first_run = (
            datetime.now(UTC)
            if self.run_on_startup
            else datetime.now(UTC) + timedelta(minutes=self.interval_minutes)
        )
        scheduler.add_job(
            self._safe_sync,
            "interval",
            minutes=self.interval_minutes,
            id=self.JOB_ID,
            replace_existing=True,
            next_run_time=first_run,
            misfire_grace_time=600,
        )
        scheduler.start()
        self._scheduler = scheduler

    def shutdown(self) -> None:
        if self._scheduler is None:
            return
        self._scheduler.shutdown(wait=False)
        self._scheduler = None

    def status(self) -> PipelineScheduleStatus:
        job = self._scheduler.get_job(self.JOB_ID) if self._scheduler else None
        next_run_at = None
        if job and job.next_run_time is not None:
            next_run_at = job.next_run_time.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")

        return PipelineScheduleStatus(
            enabled=self.enabled and self._scheduler is not None,
            interval_minutes=self.interval_minutes if self.enabled else None,
            next_run_at=next_run_at,
            run_on_startup=self.run_on_startup,
        )

    def _safe_sync(self) -> None:
        try:
            self.pipeline_service.sync_gee(trigger="scheduled")
        except Exception:  # pragma: no cover - log path only
            logger.exception("Scheduled Earth Engine sync failed")
