from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes
from app.db import init_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    routes.pipeline_scheduler.start()
    try:
        yield
    finally:
        routes.pipeline_scheduler.shutdown()


app = FastAPI(
    title="Saryna MRV API",
    version="0.1.0",
    summary="Methane and flaring workflow API for the contest MVP.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _resolve_frontend_directory() -> Path | None:
    configured = os.getenv("STATIC_EXPORT_DIR")
    candidates = []
    if configured:
        candidates.append(Path(configured))

    repo_root = Path(__file__).resolve().parents[3]
    candidates.append(repo_root / "apps" / "web" / "out")

    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


frontend_directory = _resolve_frontend_directory()
if frontend_directory:
    app.mount("/", StaticFiles(directory=frontend_directory, html=True), name="frontend")
