"""Matter export (DEC-33): queue the job here; the worker builds the .zip (jobs/handlers/export.py)."""

from sqlalchemy.orm import Session

from legallens.db.models import Job, Matter
from legallens.jobs.queue import enqueue
from legallens.services import audit
from legallens.services.auth import Principal


def start_matter_export(db: Session, me: Principal, matter: Matter) -> Job:
    job = enqueue(db, matter_id=matter.id, kind="export", payload={"requested_by": me.user.id}, max_attempts=2)
    audit.append(
        db,
        action="export",
        entity_type="matter",
        entity_id=matter.id,
        user_id=me.user.id,
        matter_id=matter.id,
        details={"kind": "matter_zip", "job_id": job.id},
    )
    return job
