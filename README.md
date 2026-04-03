---
sdk: docker
app_port: 7860
fullWidth: true
---


It is a methane and flaring workflow demo for Kazakhstan oil and gas operations.

The product focus is not a map by itself. The core loop is:

1. Load satellite screening data
2. Rank suspected zones
3. Open an operational case
4. Track verification tasks
5. Export an MRV report

## What is in this repository

- `apps/web` — Next.js frontend
- `apps/api` — FastAPI backend
- `Dockerfile` — Hugging Face Docker Space entrypoint

## Local development

Frontend:

```bash
npm install
npm run dev --workspace=@duo/web
```

Backend:

```bash
cd apps/api
pip install -e .
uvicorn app.main:app --app-dir apps/api --reload
```

## Hugging Face Space deployment

This repository is configured for a Docker Space that serves:

- the exported frontend from FastAPI static files
- the backend API on the same public port

### Runtime expectations

- The container listens on port `7860`
- If `DATABASE_URL` is not set, the app falls back to local SQLite for demo use
- Earth Engine requires project configuration and credentials through Space secrets

### Required Space secrets

- `EARTH_ENGINE_PROJECT`
- `EARTH_ENGINE_SERVICE_ACCOUNT_JSON`

Without Earth Engine credentials, the application can still boot, but screening refresh will not succeed.
