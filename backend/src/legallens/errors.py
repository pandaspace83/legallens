"""Errors as application/problem+json (RFC 9457), each with a stable machine-readable `code`."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("legallens.errors")

PROBLEM_MEDIA_TYPE = "application/problem+json"

_TITLES = {
    400: "Bad request",
    401: "Not signed in",
    403: "Forbidden",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    413: "Too large",
    415: "Unsupported file type",
    422: "Unprocessable request",
    428: "Precondition required",
    500: "Something went wrong",
    503: "Service unavailable",
}


class ApiError(Exception):
    """Raise anywhere below a route to return a problem response."""

    def __init__(self, status: int, code: str, detail: str, title: str | None = None, **extra: Any) -> None:
        super().__init__(f"{status} {code}")
        self.status = status
        self.code = code
        self.detail = detail
        self.title = title or _TITLES.get(status, "Error")
        self.extra = extra


def not_found(what: str = "Resource") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found.")


def forbidden_matter() -> ApiError:
    return ApiError(403, "forbidden_matter", "You don't have access to this matter.")


def matter_closed() -> ApiError:
    return ApiError(409, "matter_closed", "This matter is closed and read-only.")


def problem(
    request: Request,
    status: int,
    code: str,
    detail: str,
    title: str | None = None,
    errors: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"https://legallens.local/problems/{code}",
        "title": title or _TITLES.get(status, "Error"),
        "status": status,
        "detail": detail,
        "instance": request.url.path,
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
    }
    if errors:
        body["errors"] = errors
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status, media_type=PROBLEM_MEDIA_TYPE)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        return problem(request, exc.status, exc.code, exc.detail, exc.title, extra=exc.extra)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Echo where and why, never the submitted value: it may be client text.
        errors = [{"loc": list(e.get("loc", [])), "msg": e.get("msg", "")} for e in exc.errors()]
        return problem(request, 422, "validation_error", "The request is not valid.", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return problem(request, exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the type and route only; exception messages can carry document text.
        log.error("unhandled_error", extra={"error_type": type(exc).__name__, "path": request.url.path})
        return problem(request, 500, "internal_error", "Something went wrong. Try again.")
