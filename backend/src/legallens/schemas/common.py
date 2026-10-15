"""Shared API types."""

from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class RequestModel(BaseModel):
    """Request bodies reject unknown fields, so a typo fails loudly instead of being ignored."""

    model_config = ConfigDict(extra="forbid")


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](ResponseModel):
    items: list[T]
    next_cursor: str | None = None


class Problem(ResponseModel):
    """application/problem+json (RFC 9457)."""

    type: str
    title: str
    status: int
    detail: str
    instance: str
    code: str
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None


class ErrorInfo(ResponseModel):
    code: str
    message: str


Timestamp = AwareDatetime
BBox = list[float]  # [x0, y0, x1, y1], PDF points, top-left origin

ScopeKind = Literal["all", "documents"]


class Scope(BaseModel):
    """'all' = every ready document in the matter; 'documents' = the listed ones ("This document" = one id)."""

    kind: ScopeKind = "all"
    document_ids: list[str] = Field(default_factory=list, max_length=200)


class InlineCitation(ResponseModel):
    n: int
    chunk_id: int
    document_id: str
    document_name: str | None = None
    page: int
    para_ref: str | None = None
    quote: str
    bbox: list[dict[str, Any]] | None = None


def problem_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses=` entries documenting problem+json errors."""
    return {
        status: {"model": Problem, "content": {"application/problem+json": {}}, "description": "Problem"}
        for status in statuses
    }
