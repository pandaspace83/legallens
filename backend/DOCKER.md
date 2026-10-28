# Running the backend in Docker

Built and run on Docker 29.9.2 (Apple Silicon, `--platform linux/amd64`) on 2026-10-28. Image size: 714 MB (CPU-only PyTorch). The container
starts, migrates, answers `/api/v1/health` and shuts down on SIGTERM in under a second.

## Build and run (Apple Silicon Mac, image for linux/amd64)

```bash
cd backend
cp env.docker.example env.docker
docker build --platform linux/amd64 -t legallens-backend:local .
docker run --rm --name legallens-backend --platform linux/amd64 -p 127.0.0.1:8000:8000 \
  --env-file env.docker -v legallens-data:/data legallens-backend:local
```

Drop `--platform linux/amd64` to build natively for the Mac (faster to try; AKS needs amd64).

## Check that it works

```bash
curl -s localhost:8000/api/v1/health            # JSON per component; no sign-in needed
open http://localhost:8000/docs                 # OpenAPI docs
docker exec legallens-backend legallens seed    # once per new volume: the dev user and 3 demo matters (no documents)
curl -s -c jar -X POST localhost:8000/api/v1/auth/dev-session -H 'content-type: application/json' -d '{}'
curl -s -b jar localhost:8000/api/v1/matters    # the three demo matters (401 "No such user" means you skipped the seed)
```

Logs: `docker logs -f legallens-backend` (JSON, to stdout). Shell: `docker exec -it legallens-backend sh`.
Stop: `docker stop legallens-backend` (SIGTERM, clean shutdown). Clean up: `docker volume rm legallens-data`
(this deletes the database and uploads).

## Environment variables

Nothing is required: the image sets `LEGALLENS_DATA_DIR=/data`, `LEGALLENS_HOST=0.0.0.0`, `LEGALLENS_PORT=8000` and
`LEGALLENS_INPROCESS_WORKER=true`. Without an env file the image tries `clamd`, `bge-m3` and the local models, none of
which exist in the container, so use `env.docker.example`. Every setting is listed in [.env.example](.env.example).

## Decisions

- **`python:3.13.9-slim-bookworm`, builder and runtime.** `requires-python` is `>=3.13,<3.14`. Slim, not Alpine: PyTorch and
  Docling wheels are built for glibc.
- **Models are not baked in.** `legallens models download` fetches about 4.5 GB (bge-m3, the reranker), plus Docling's
  layout models. Baking them in makes every build and pull huge and ties the image to a model version. Loading them onto
  the `/data` volume costs a one-time download. To fetch them:
  `docker run --rm --env-file env.docker -v legallens-data:/data legallens-backend:local legallens models download`
  (a command given to `docker run` replaces the server). Then set `LEGALLENS_EMBEDDER=bge-m3`, `LEGALLENS_RERANKER=bge`
  and `LEGALLENS_CONVERTER=docling`.
- **One process, one container.** The worker runs inside the API process, so a single container does everything.
  SQLite allows one writer: run exactly one replica.
- **Migrations run at start.** The app refuses to start on an old schema, so the entrypoint runs `legallens db upgrade`.
- **`HEALTHCHECK` uses Python.** The slim image has no curl. `/api/v1/health` returns 200 with per-component status;
  AKS can use it for liveness. Readiness should check the `ok` fields, not only the status code.

## Open points

- **Size.** 714 MB. On Linux, `pyproject.toml` takes `torch` and `torchvision` from the CPU-only PyTorch index, which dropped
  the CUDA libraries (the image was 3.52 GB). macOS and Windows still use the PyPI builds, so a Linux container
  runs `torch 2.15.0+cpu` where the Mac runs `2.14.1`. For a GPU node, remove the `[tool.uv.sources]` entries and re-lock.
- **Health says `degraded`** with the scanner off. That is expected here; the container itself reports healthy.
- **Frontend.** `frontend/Dockerfile` serves the built app and proxies `/api` to `API_UPSTREAM` (default
  `http://backend:8000`). Put both containers on one network with the backend named `backend`, as in a compose file.
- **State.** The image is stateless only if `/data` is a volume (a PVC in AKS). SQLite means one replica.
- **Scanner.** ClamAV talks over a Unix socket only, so the container uses `LEGALLENS_SCANNER=none`. Real client
  documents need a scanner first.
- **Network.** DEC-08 keeps the API on the local machine. `LEGALLENS_HOST=0.0.0.0` is needed inside a container; publish
  the port as `-p 127.0.0.1:8000:8000` to keep it on this Mac.
