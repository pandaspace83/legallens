"""F · Summaries and jobs: start a summary, read it, follow jobs, and the matter's event stream."""

import asyncio
from collections.abc import AsyncIterator

import anyio
from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select
from sse_starlette import EventSourceResponse, ServerSentEvent

from legallens.api.deps import AppSettings, CurrentUser, ReadDB, WriteDB, load_in_matter, load_matter
from legallens.db.models import Document, Job, Summary
from legallens.db.scope import set_scope
from legallens.errors import ApiError
from legallens.jobs.queue import request_cancel
from legallens.schemas.common import ErrorInfo, Page, problem_responses
from legallens.schemas.jobs import JobOut, JobResult, SummaryAccepted, SummaryListItem, SummaryOut, SummaryRequest
from legallens.services import events, summaries
from legallens.services.chat import dumps

router = APIRouter(tags=["F · Summaries and jobs"])


def job_out(job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        matter_id=job.matter_id,
        kind=job.kind,  # type: ignore[arg-type]
        status=job.status,  # type: ignore[arg-type]
        progress=job.progress,
        step=job.step,
        attempts=job.attempts,
        document_id=job.document_id,
        error=ErrorInfo.model_validate(job.error_json) if job.error_json else None,
        result=JobResult.model_validate(job.result_json) if job.result_json else None,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


@router.post(
    "/documents/{document_id}/summaries",
    status_code=202,
    operation_id="createSummary",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_summary(document_id: str, body: SummaryRequest, me: CurrentUser, db: WriteDB) -> SummaryAccepted:
    document, _ = load_in_matter(db, me, Document, document_id, writable=True, label="Document")
    summary, job_id = summaries.start(
        db, user_id=me.user.id, document=document, template=body.template, audience=body.audience
    )
    db.commit()
    return SummaryAccepted(summary_id=summary.id, job_id=job_id)


@router.get("/matters/{matter_id}/summaries", operation_id="listSummaries", responses=problem_responses(401, 403, 404))
def list_summaries(
    matter_id: str,
    me: CurrentUser,
    db: ReadDB,
    document_id: str | None = None,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> Page[SummaryListItem]:
    """The matter's summaries, newest first; `document_id` narrows it to one document (INT-1.3)."""
    matter = load_matter(db, me, matter_id)
    stmt = (
        select(Summary, Document.filename)
        .join(Document, Document.id == Summary.document_id)
        .where(Summary.matter_id == matter.id)
    )
    if document_id:
        stmt = stmt.where(Summary.document_id == document_id)
    if cursor:
        stmt = stmt.where(Summary.id < cursor)
    rows = db.execute(stmt.order_by(Summary.id.desc()).limit(limit + 1)).all()
    page = rows[:limit]
    return Page[SummaryListItem](
        items=[summaries.list_item(summary, name) for summary, name in page],
        next_cursor=page[-1][0].id if len(rows) > limit and page else None,
    )


@router.get("/summaries/{summary_id}", operation_id="getSummary", responses=problem_responses(401, 403, 404))
def get_summary(summary_id: str, me: CurrentUser, db: ReadDB) -> SummaryOut:
    summary, _ = load_in_matter(db, me, Summary, summary_id, label="Summary")
    document = db.get(Document, summary.document_id)
    return summaries.to_out(summary, document.filename if document else None)


DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@router.post(
    "/summaries/{summary_id}/export",
    operation_id="exportSummary",
    response_class=Response,
    responses={200: {"content": {DOCX_MEDIA_TYPE: {}}}, **problem_responses(401, 403, 404, 409)},
)
def export_summary(summary_id: str, me: CurrentUser, db: WriteDB) -> Response:
    """The summary as a .docx working copy with its sources, stamped privileged (decision 5). Summaries are for
    the lawyer's file, so there is no clean copy."""
    summary, _ = load_in_matter(db, me, Summary, summary_id, label="Summary")
    document = db.get(Document, summary.document_id)
    data, filename = summaries.export(db, me.user.id, summary, document.filename if document else "document")
    db.commit()
    return Response(
        content=data,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"},
    )


@router.get("/jobs/{job_id}", operation_id="getJob", responses=problem_responses(401, 403, 404))
def get_job(job_id: str, me: CurrentUser, db: ReadDB) -> JobOut:
    job, _ = load_in_matter(db, me, Job, job_id, label="Job")
    return job_out(job)


@router.post("/jobs/{job_id}/cancel", operation_id="cancelJob", responses=problem_responses(401, 403, 404, 409))
def cancel_job(job_id: str, me: CurrentUser, db: WriteDB) -> JobOut:
    """A queued job is cancelled at once; a running one stops at its next step."""
    job, _ = load_in_matter(db, me, Job, job_id, label="Job")
    request_cancel(db, job)
    db.commit()
    return job_out(job)


@router.get(
    "/jobs/{job_id}/file",
    operation_id="getJobFile",
    response_class=FileResponse,
    responses={200: {"content": {"application/zip": {}}}, **problem_responses(401, 403, 404, 409)},
)
def get_job_file(job_id: str, me: CurrentUser, db: ReadDB, settings: AppSettings) -> FileResponse:
    """The file a finished export job produced (the matter .zip, DEC-33)."""
    job, _ = load_in_matter(db, me, Job, job_id, label="Job")
    if job.kind != "export":
        raise ApiError(404, "not_found", "This job has no file.")
    if job.status != "done":
        raise ApiError(409, "job_not_done", "The export isn't finished yet.")
    path = settings.exports_dir / job.matter_id / f"{job.id}.zip"
    if not path.exists():
        raise ApiError(404, "not_found", "The export file is no longer available. Export the matter again.")
    return FileResponse(path, media_type="application/zip", filename=f"matter-export-{job.matter_id}.zip")


@router.get(
    "/matters/{matter_id}/events",
    operation_id="streamMatterEvents",
    response_class=EventSourceResponse,
    responses={200: {"content": {"text/event-stream": {}}}, **problem_responses(401, 403, 404)},
)
async def matter_events(
    matter_id: str,
    request: Request,
    me: CurrentUser,
    last_event_id_header: str | None = Header(None, alias="Last-Event-ID"),
    since: int | None = None,
) -> EventSourceResponse:
    """job.progress, job.done, job.failed, document.ready, document.failed and conversation.updated.

    Without Last-Event-ID (or ?since=) the stream starts from now; with it, missed events are replayed."""
    database, settings = request.app.state.database, request.app.state.settings

    def _open() -> int:
        with database.read_session() as db:
            matter = load_matter(db, me, matter_id)
            if since is not None:
                return max(0, since)
            if last_event_id_header and last_event_id_header.strip().isdigit():
                return int(last_event_id_header.strip())
            return events.latest_id(db, matter.id)

    start_after = await run_in_threadpool(_open)

    def _fetch(after: int) -> list[tuple[int, str, dict[str, object]]]:
        with database.read_session() as db:
            set_scope(db, matter_id)
            return [(e.id, e.type, e.data_json) for e in events.since(db, matter_id, after)]

    async def _tail() -> AsyncIterator[dict[str, str]]:
        last = start_after
        while True:
            rows = await anyio.to_thread.run_sync(_fetch, last)
            for event_id, event_type, data in rows:
                last = event_id
                yield {"id": str(event_id), "event": event_type, "data": dumps(data)}  # type: ignore[arg-type]
            if not rows:
                await asyncio.sleep(settings.events_poll_seconds)

    return EventSourceResponse(
        _tail(), ping=settings.sse_ping_seconds, ping_message_factory=lambda: ServerSentEvent(comment="ping")
    )
