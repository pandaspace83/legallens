"""Serves the built frontend from the API's own origin (INT-5.1), so `legallens serve` is the whole app.

One origin means the SameSite=Strict session cookie works with no CORS and no proxy. Built files have hashed
names and are cached for a year; `index.html` is never cached, so a new build is picked up at once. Anything
that is not a file and not under /api falls back to `index.html`, so a refresh on /m/abc/documents works.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.responses import Response

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
# Everything is same-origin: no CDN, no remote fonts, no telemetry (DEC-56). Inline styles are allowed because
# the UI libraries set them on elements at run time.
CSP = (
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
    "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def _file(path: Path, cache: str) -> FileResponse:
    return FileResponse(path, headers={**HEADERS, "Cache-Control": cache})


def mount_frontend(app: FastAPI, folder: Path) -> None:
    root = folder.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str) -> Response:
        # An unknown API path is a JSON 404, never the app's page.
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found.")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            hashed = candidate.parent.name == "assets"
            return _file(candidate, IMMUTABLE if hashed else NO_CACHE)
        return _file(index, NO_CACHE)
