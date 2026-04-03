# Saryna MRV API

FastAPI backend scaffold for the contest MVP.

## Why this stack

- FastAPI keeps the API layer typed, fast to wire, and easy to explain
- Python is the shortest path for the geospatial stack we will need next
- PostGIS can sit behind the same geometry concepts we prototype here

## Current scope

- seeded anomaly feed
- incident promotion
- task tracking
- MRV report preview

## Run once Python is available

```bash
pip install "fastapi[standard]"
fastapi dev app/main.py
```

Open:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/api/v1/dashboard`

## MVP note

This backend intentionally uses an in-memory demo store first. That is a `[temporary MVP shortcut]` so we can stabilize the workflow and UI before wiring Sentinel-5P, VIIRS Nightfire, and PostGIS ingestion.
