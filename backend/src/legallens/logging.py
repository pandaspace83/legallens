"""JSON logs with request IDs.

Rule (DEC-68, RISK-12): log IDs, counts, codes and timings only. Never log message text, document text,
file names, matter names or query strings. The log-hygiene test plants a canary string in a document and
fails if it ever shows up here.
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_STANDARD_ATTRS = set(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id:
            entry["request_id"] = request_id
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                entry[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            # The exception type only: messages and tracebacks can carry client text.
            entry["error_type"] = record.exc_info[0].__name__
        return json.dumps(entry, default=str)


# Third-party loggers that can print request or document content at INFO or DEBUG (sse-starlette logs every
# streamed chunk; SQLAlchemy logs SQL parameters; parsers log text). They are held at WARNING even if someone
# turns the root logger up to DEBUG.
QUIET_LOGGERS = (
    "sse_starlette",
    "sqlalchemy",
    "multipart",
    "python_multipart",
    "httpx",
    "httpx2",
    "httpcore",
    "urllib3",
    "asyncio",
    "PIL",
    "docling",
    "docling_core",
    "docling_ibm_models",
    "docling_parse",
    "rapidocr",
    "huggingface_hub",
    "transformers",
    "sentence_transformers",
    "torch",
    "filelock",
    "extract_msg",
    "olefile",
    "fsspec",
)


def configure_logging(level: str = "INFO") -> None:
    """Allowlist: LegalLens's own loggers at `level`, everything else at WARNING."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.WARNING)
    for name in ("legallens", "uvicorn.error", "alembic.runtime.migration"):
        logging.getLogger(name).setLevel(level)
    # uvicorn's access log prints raw query strings (chat search terms, typed confirmations); we log our own.
    logging.getLogger("uvicorn.access").disabled = True
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


class RequestContextMiddleware:
    """Sets a request ID (echoed as X-Request-ID) and writes one access line per request, path without query."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.log = logging.getLogger("legallens.access")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        incoming = headers.get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if 0 < len(incoming) <= 64 and incoming.isascii() else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            self.log.info(
                "request",
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_holder["status"],
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_var.reset(token)
