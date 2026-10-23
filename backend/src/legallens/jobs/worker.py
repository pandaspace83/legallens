"""The worker loop: claim a job, run its handler, record the outcome. One job at a time (Docling is heavy)."""

import logging
import threading
import time

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.jobs.handlers import get_handler
from legallens.jobs.queue import (
    ClaimedJob,
    JobCancelled,
    JobContext,
    JobError,
    claim,
    mark_done,
    mark_failed,
    recover_stale,
)
from legallens.services import auth, events

log = logging.getLogger("legallens.worker")

HOUSEKEEPING_SECONDS = 60


def execute(database: Database, settings: Settings, job: ClaimedJob) -> None:
    handler = get_handler(job.kind)
    ctx = JobContext(database=database, settings=settings, job=job)
    started = time.perf_counter()
    log.info("job_started", extra={"job_id": job.id, "kind": job.kind, "attempt": job.attempts})
    try:
        result = handler.run(ctx)
        mark_done(ctx, result)
        outcome = "done"
    except JobCancelled:
        mark_failed(ctx, "cancelled", "Cancelled.", retryable=False)
        handler.failed(ctx, "cancelled", "Cancelled.")
        outcome = "cancelled"
    except JobError as exc:
        retrying = mark_failed(ctx, exc.code, exc.message, retryable=exc.retryable)
        if not retrying:
            handler.failed(ctx, exc.code, exc.message)
        outcome = "retrying" if retrying else "failed"
    except Exception as exc:
        # Log the type only: messages from parsers can quote document text.
        log.exception("job_crashed", extra={"job_id": job.id, "kind": job.kind, "error_type": type(exc).__name__})
        message = "Something went wrong while processing this. It will be retried."
        retrying = mark_failed(ctx, "internal_error", message, retryable=True)
        if not retrying:
            handler.failed(ctx, "internal_error", "Something went wrong while processing this.")
        outcome = "retrying" if retrying else "failed"
    log.info(
        "job_finished",
        extra={
            "job_id": job.id,
            "kind": job.kind,
            "outcome": outcome,
            "duration_ms": round((time.perf_counter() - started) * 1000),
        },
    )


def _housekeeping(database: Database, settings: Settings) -> None:
    recover_stale(database, settings)
    with database.write() as db:
        events.prune(db)
        auth.purge_expired(db)


def run_pending(database: Database, settings: Settings, max_jobs: int = 1000) -> int:
    """Runs queued jobs until none is ready. Used by tests and `legallens jobs run`."""
    count = 0
    while count < max_jobs and (job := claim(database)) is not None:
        execute(database, settings, job)
        count += 1
    return count


HEARTBEAT_SECONDS = 3.0


def _touch_heartbeat(settings: Settings) -> None:
    settings.worker_heartbeat_path.parent.mkdir(parents=True, exist_ok=True)
    settings.worker_heartbeat_path.touch()


def execute_with_heartbeat(
    database: Database, settings: Settings, job: ClaimedJob, interval: float = HEARTBEAT_SECONDS
) -> None:
    """Runs a job while a side thread keeps the heartbeat fresh. A summary or an ingestion can run for minutes, and
    the heartbeat is otherwise touched only between jobs: /health would call a busy worker dead and the app would
    tell the lawyer that background work is paused while it is running."""
    done = threading.Event()

    def beat() -> None:
        while not done.wait(interval):
            _touch_heartbeat(settings)

    thread = threading.Thread(target=beat, name="legallens-heartbeat", daemon=True)
    thread.start()
    try:
        execute(database, settings, job)
    finally:
        done.set()
        thread.join(timeout=interval + 1)


def run_worker(database: Database, settings: Settings, stop: threading.Event) -> None:
    log.info("worker_started")
    _housekeeping(database, settings)
    last_housekeeping = time.monotonic()
    while not stop.is_set():
        _touch_heartbeat(settings)
        try:
            job = claim(database)
        except Exception:
            log.exception("claim_failed")
            stop.wait(settings.worker_poll_seconds * 4)
            continue
        if job is not None:
            execute_with_heartbeat(database, settings, job)
        else:
            stop.wait(settings.worker_poll_seconds)
        if time.monotonic() - last_housekeeping > HOUSEKEEPING_SECONDS:
            _housekeeping(database, settings)
            last_housekeeping = time.monotonic()
    log.info("worker_stopped")


def start_in_thread(database: Database, settings: Settings) -> tuple[threading.Thread, threading.Event]:
    stop = threading.Event()
    thread = threading.Thread(target=run_worker, args=(database, settings, stop), name="legallens-worker", daemon=True)
    thread.start()
    return thread, stop
