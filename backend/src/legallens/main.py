"""App factory. Run with `uv run legallens serve` (API) and `uv run legallens worker`, or both via `legallens dev`."""

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.telemetry import TelemetryConfig
from starlette.types import ASGIApp, Receive, Scope, Send

from legallens import __version__
from legallens.api.v1 import api_router
from legallens.config import Settings, get_settings
from legallens.db.engine import Database
from legallens.db.migrate import current_revision, head_revision
from legallens.errors import install_error_handlers
from legallens.logging import RequestContextMiddleware, configure_logging
from legallens.services.chat import mark_interrupted_runs
from legallens.streaming.runs import RunRegistry

log = logging.getLogger("legallens.app")

# Nothing leaves this machine (DEC-56). FastAPI ships OpenTelemetry hooks whose log signal records exception
# messages, which can carry document text; turn every signal and the environment-driven exporter off.
NO_TELEMETRY: TelemetryConfig = {
    "tracing": False,
    "metrics": False,
    "logs": False,
    "operation_spans": False,
    "auto_configure": False,
}
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

UPLOAD_OVERHEAD_BYTES = 1024 * 1024


class UploadSizeLimit:
    """Rejects an oversized upload from its Content-Length before the body is read (413 file_too_large)."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "POST" and scope["path"].endswith("/documents"):
            length = dict(scope.get("headers") or []).get(b"content-length")
            if length is not None and length.isdigit() and int(length) > self.max_bytes + UPLOAD_OVERHEAD_BYTES:
                from starlette.requests import Request

                from legallens.errors import problem

                mb = self.max_bytes // (1024 * 1024)
                response = problem(Request(scope), 413, "file_too_large", f"Files can be up to {mb} MB.")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


CSRF_HEADER = b"x-legallens-request"


class RequireCsrfHeader:
    """Real sign-in only: a write must carry `X-LegalLens-Request`, which a page on another origin can't add
    without a CORS preflight that this API never grants (DEC-54). SameSite=Strict on the cookie is the first line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] == "http"
            and scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}
            and scope["path"].startswith("/api/v1")
            and CSRF_HEADER not in dict(scope.get("headers") or [])
        ):
            from starlette.requests import Request

            from legallens.errors import problem

            response = problem(Request(scope), 403, "csrf_header_missing", "This request didn't come from LegalLens.")
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.ensure_dirs()
        database = Database(settings.db_path)
        if current_revision(database) != head_revision():
            database.dispose()
            raise RuntimeError("The database schema is not up to date. Run: uv run legallens db upgrade")
        app.state.database = database
        app.state.runs = RunRegistry(database, settings)
        mark_interrupted_runs(database)
        worker = None
        if settings.inprocess_worker:
            from legallens.jobs.worker import start_in_thread

            worker = start_in_thread(database, settings)
        log.info("app_started", extra={"version": __version__, "auth_mode": settings.auth_mode})
        try:
            yield
        finally:
            await app.state.runs.shutdown()
            if worker is not None:
                thread, stop = worker
                stop.set()
                thread.join(timeout=10)
            database.dispose()

    app = FastAPI(
        title="LegalLens API",
        version=__version__,
        summary="Local backend for LegalLens: matters, documents, chat over SSE, summaries and drafts.",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
        telemetry=NO_TELEMETRY,
    )
    app.state.settings = settings
    install_error_handlers(app)
    app.add_middleware(UploadSizeLimit, max_bytes=settings.max_upload_bytes)
    if settings.auth_mode == "real":
        app.add_middleware(RequireCsrfHeader)
    app.add_middleware(RequestContextMiddleware)
    app.include_router(api_router, prefix="/api/v1")
    # Last, so the API, /docs and /openapi.json keep their own paths.
    frontend = settings.frontend_path
    if frontend is not None:
        from legallens.web import mount_frontend

        mount_frontend(app, frontend)
    return app
