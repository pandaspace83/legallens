"""Matter event outbox. The API and the worker append rows; GET /matters/{id}/events tails them over SSE.

The row id is the SSE event id, so a browser reconnecting with Last-Event-ID resumes exactly where it left
off, even across a restart of either process.
"""

from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from legallens.db.models import MatterEvent
from legallens.db.scope import unscoped
from legallens.timeutil import utcnow

EVENT_TYPES = {
    "job.progress",
    "job.done",
    "job.failed",
    "document.ready",
    "document.failed",
    "conversation.updated",
}
RETENTION = timedelta(days=7)


def emit(session: Session, matter_id: str, event_type: str, data: dict[str, Any]) -> MatterEvent:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Unknown matter event {event_type}")
    event = MatterEvent(matter_id=matter_id, type=event_type, data_json=data)
    session.add(event)
    return event


def since(session: Session, matter_id: str, last_id: int, limit: int = 200) -> list[MatterEvent]:
    stmt = (
        select(MatterEvent)
        .where(MatterEvent.matter_id == matter_id, MatterEvent.id > last_id)
        .order_by(MatterEvent.id)
        .limit(limit)
    )
    return list(session.execute(stmt).scalars())


def latest_id(session: Session, matter_id: str) -> int:
    stmt = select(MatterEvent.id).where(MatterEvent.matter_id == matter_id).order_by(MatterEvent.id.desc()).limit(1)
    return session.execute(stmt).scalar() or 0


def prune(session: Session) -> int:
    with unscoped(session):
        result = session.execute(delete(MatterEvent).where(MatterEvent.created_at < utcnow() - RETENTION))
    return int(getattr(result, "rowcount", 0) or 0)
