"""F · Summaries and jobs."""

from typing import Literal

from legallens.schemas.chat import Audience, SummaryTemplate
from legallens.schemas.common import ErrorInfo, InlineCitation, RequestModel, ResponseModel, Timestamp
from legallens.schemas.documents import Coverage

JobKind = Literal["ingest", "summarize", "draft", "regenerate", "export"]
JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]


class JobResult(ResponseModel):
    kind: str
    id: str
    url: str


class JobOut(ResponseModel):
    id: str
    matter_id: str
    kind: JobKind
    status: JobStatus
    progress: int
    step: str | None = None
    attempts: int
    document_id: str | None = None
    error: ErrorInfo | None = None
    result: JobResult | None = None
    created_at: Timestamp
    started_at: Timestamp | None = None
    finished_at: Timestamp | None = None


class JobAccepted(ResponseModel):
    job_id: str


class SummaryRequest(RequestModel):
    template: SummaryTemplate
    audience: Audience = "detailed"


class SummaryAccepted(ResponseModel):
    summary_id: str
    job_id: str


class SummarySection(ResponseModel):
    field: str
    title: str
    found: bool
    content: str
    citations: list[InlineCitation]


class SummaryListItem(ResponseModel):
    """A summary in the matter's list; GET /summaries/{id} has the sections."""

    id: str
    document_id: str
    document_name: str
    template: SummaryTemplate
    audience: Audience
    status: Literal["pending", "ready", "failed"]
    conversation_id: str | None = None
    created_at: Timestamp


class SummaryOut(ResponseModel):
    id: str
    matter_id: str
    document_id: str
    document_name: str | None = None  # (INT-1.7)
    conversation_id: str | None = None  # the chat that asked for it
    template: SummaryTemplate
    audience: Audience
    status: Literal["pending", "ready", "failed"]
    job_id: str | None = None
    sections: list[SummarySection]
    coverage: Coverage | None = None
    model_id: str | None = None
    prompt_version: str | None = None
    error: ErrorInfo | None = None
    created_at: Timestamp
