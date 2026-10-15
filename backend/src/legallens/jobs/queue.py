"""The `jobs` table as the worker's queue: no broker, and queued jobs survive a restart (TA, "Background jobs").

Claiming is one UPDATE … RETURNING inside a BEGIN IMMEDIATE transaction, so two workers can never take the
same job. Running jobs heartbeat; a job whose heartbeat goes stale (its worker died) is re-queued or failed.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import Job
from legallens.db.scope import set_scope, unscoped
from legallens.errors import ApiError
from legallens.ids import new_id
from legallens.services import events
from legallens.timeutil import utcnow


class JobCancelled(Exception):
    pass


class JobError(Exception):
    """A known failure with a message the lawyer can act on. Not retried unless retryable=True."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.message = message
        self.retryable = retryable


def result_url(kind: str, entity_id: str, job_id: str) -> str:
    return {
        "document": f"/api/v1/documents/{entity_id}",
        "summary": f"/api/v1/summaries/{entity_id}",
        "draft": f"/api/v1/drafts/{entity_id}",
        "export": f"/api/v1/jobs/{job_id}/file",
    }[kind]


def enqueue(
    db: Session,
    *,
    matter_id: str,
    kind: str,
    payload: dict[str, Any] | None = None,
    document_id: str | None = None,
    max_attempts: int = 3,
) -> Job:
    job = Job(
        id=new_id("job"),
        matter_id=matter_id,
        kind=kind,
        status="queued",
        payload_json=payload or {},
        document_id=document_id,
        max_attempts=max_attempts,
        available_at=utcnow(),
    )
    db.add(job)
    db.flush()
    return job


def request_cancel(db: Session, job: Job) -> Job:
    if job.status == "queued":
        job.status = "cancelled"
        job.finished_at = utcnow()
        job.error_json = {"code": "cancelled", "message": "Cancelled."}
        events.emit(
            db,
            job.matter_id,
            "job.failed",
            {"job_id": job.id, "kind": job.kind, "error": job.error_json, **_entity_ids(job.payload_json)},
        )
    elif job.status == "running":
        job.cancel_requested = True
    else:
        raise ApiError(409, "job_not_cancellable", f"This job is already {job.status}.")
    return job


@dataclass
class ClaimedJob:
    id: str
    matter_id: str
    kind: str
    attempts: int
    max_attempts: int
    payload: dict[str, Any]
    document_id: str | None


def claim(database: Database) -> ClaimedJob | None:
    now = utcnow()
    with database.write() as db, unscoped(db):
        next_id = (
            select(Job.id)
            .where(Job.status == "queued", Job.available_at <= now)
            .order_by(Job.created_at, Job.id)
            .limit(1)
            .scalar_subquery()
        )
        row = db.execute(
            update(Job)
            .where(Job.id == next_id)
            .values(status="running", attempts=Job.attempts + 1, started_at=now, heartbeat_at=now)
            .returning(
                Job.id, Job.matter_id, Job.kind, Job.attempts, Job.max_attempts, Job.payload_json, Job.document_id
            )
        ).first()
    if row is None:
        return None
    return ClaimedJob(*row)


def recover_stale(database: Database, settings: Settings) -> int:
    cutoff = utcnow() - timedelta(seconds=settings.job_stale_seconds)
    recovered = 0
    with database.write() as db, unscoped(db):
        stale = db.execute(select(Job).where(Job.status == "running", Job.heartbeat_at < cutoff)).scalars().all()
        for job in stale:
            recovered += 1
            if job.attempts < job.max_attempts:
                job.status = "queued"
                job.step = "Waiting to retry"
            else:
                job.status = "failed"
                job.finished_at = utcnow()
                job.error_json = {"code": "worker_lost", "message": "The worker stopped while running this job."}
                events.emit(
                    db,
                    job.matter_id,
                    "job.failed",
                    {"job_id": job.id, "kind": job.kind, "error": job.error_json, **_entity_ids(job.payload_json)},
                )
        # Flush inside the unscoped block: these rows span matters, and the commit happens after it closes.
        db.flush()
    return recovered


_DONE_FIELDS = ("document_id", "document_name", "title")


def _entity_ids(payload: dict[str, Any] | None) -> dict[str, Any]:
    """The summary or draft a job works on, from its payload."""
    return {k: payload[k] for k in ("summary_id", "draft_id") if payload and k in payload}


@dataclass
class JobContext:
    """What a handler gets: progress reporting, cancellation checks and scoped write sessions."""

    database: Database
    settings: Settings
    job: ClaimedJob
    _last_progress: tuple[int, str | None, str | None] = field(default=(-1, None, None))

    @property
    def matter_id(self) -> str:
        return self.job.matter_id

    @contextmanager
    def session(self) -> Iterator[Session]:
        with self.database.write() as db:
            set_scope(db, self.job.matter_id)
            yield db

    @contextmanager
    def read_session(self) -> Iterator[Session]:
        with self.database.read() as db:
            set_scope(db, self.job.matter_id)
            yield db

    def progress(self, pct: int, step: str | None = None, *, code: str | None = None, **extra: Any) -> None:
        """Records progress, emits job.progress when it changes, and stops the handler if cancel was requested.

        `step` is the line a person reads ("Reading pages 3 of 12"); `code` is the stable step the screens track
        (ingest: checking, reading, ocr, indexing; summarize: reading, extracting, writing, verifying; draft:
        reading, claims, retrieving, drafting, safeguards, verifying). The event carries both, as `detail` and
        `step_code`, plus the summary or draft the job is making (INT-1.2).
        """
        pct = max(0, min(99, int(pct)))
        with self.session() as db:
            job = db.get(Job, self.job.id)
            if job is None or job.cancel_requested:
                raise JobCancelled()
            job.heartbeat_at = utcnow()
            if (pct, step, code) != self._last_progress:
                job.progress = pct
                job.step = step
                data: dict[str, Any] = {
                    "job_id": job.id,
                    "kind": job.kind,
                    "pct": pct,
                    "step": step,
                    "step_code": code,
                    "detail": step,
                }
                if job.document_id:
                    data["document_id"] = job.document_id
                data.update(_entity_ids(job.payload_json))
                data.update(extra)
                events.emit(db, job.matter_id, "job.progress", data)
                self._last_progress = (pct, step, code)

    def check_cancelled(self) -> None:
        with self.read_session() as db:
            job = db.get(Job, self.job.id)
            if job is None or job.cancel_requested:
                raise JobCancelled()


def mark_done(ctx: JobContext, result: dict[str, Any] | None) -> None:
    with ctx.session() as db:
        job = db.get(Job, ctx.job.id)
        if job is None:
            return
        job.status = "done"
        job.progress = 100
        job.step = "Done"
        job.finished_at = utcnow()
        job.result_json = result
        url = result.get("url") if result else None
        data: dict[str, Any] = {"job_id": job.id, "kind": job.kind, "result_url": url}
        if result:
            # The item the job made, by id and by name, so the screen can say "Summary of X is ready" (INT-1.2).
            data["entity_id"] = result.get("id")
            data.update({k: result[k] for k in _DONE_FIELDS if k in result})
        data.update(_entity_ids(job.payload_json))
        events.emit(db, job.matter_id, "job.done", data)


def mark_failed(ctx: JobContext, code: str, message: str, *, retryable: bool) -> bool:
    """Returns True if the job will be retried."""
    with ctx.session() as db:
        job = db.get(Job, ctx.job.id)
        if job is None:
            return False
        if retryable and job.attempts < job.max_attempts:
            job.status = "queued"
            job.step = "Waiting to retry"
            job.available_at = utcnow() + timedelta(seconds=2**job.attempts)
            return True
        job.status = "cancelled" if code == "cancelled" else "failed"
        job.finished_at = utcnow()
        job.error_json = {"code": code, "message": message}
        events.emit(
            db,
            job.matter_id,
            "job.failed",
            {"job_id": job.id, "kind": job.kind, "error": job.error_json, **_entity_ids(job.payload_json)},
        )
        return False
