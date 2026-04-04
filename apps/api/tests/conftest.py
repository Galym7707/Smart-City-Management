import os
from pathlib import Path

import pytest

from app.api import routes
from app.db import configure_database, reset_database
from app.services.workflow_store import WorkflowStore


@pytest.fixture(autouse=True)
def isolated_database(tmp_path: Path) -> None:
    previous_auto_sync = os.environ.get("PIPELINE_AUTO_SYNC_ENABLED")
    os.environ["PIPELINE_AUTO_SYNC_ENABLED"] = "false"
    database_url = f"sqlite+pysqlite:///{(tmp_path / 'test.sqlite3').as_posix()}"
    configure_database(database_url)
    reset_database()
    routes.replace_runtime_services(WorkflowStore())
    yield
    if previous_auto_sync is None:
        os.environ.pop("PIPELINE_AUTO_SYNC_ENABLED", None)
    else:
        os.environ["PIPELINE_AUTO_SYNC_ENABLED"] = previous_auto_sync
