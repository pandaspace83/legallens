"""Matters: create, edit, close, list (DEC-09, DEC-30, DEC-32, DEC-60)."""

from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from legallens.db.models import Conversation, Document, Job, Matter, Message
from legallens.db.scope import set_scope, unscoped
from legallens.ids import new_id
from legallens.schemas.matters import (
    AiConsent,
    CounselBrief,
    MatterCounts,
    MatterCreate,
    MatterOut,
    MatterProfile,
    MatterSummaryOut,
    MatterUpdate,
    MatterUsage,
)
from legallens.services import audit
from legallens.services.auth import Principal
from legallens.services.pagination import decode_cursor, encode_cursor
from legallens.timeutil import iso, utcnow


def create(db: Session, me: Principal, body: MatterCreate) -> Matter:
    matter = Matter(
        id=new_id("matter"),
        owner_user_id=me.user.id,
        name=body.name.strip(),
        client_name=body.client_name.strip(),
        our_side=body.our_side.strip(),
        court=body.court,
        jurisdiction=body.jurisdiction,
        practice_area=body.practice_area,
        profile_json=(body.profile or MatterProfile()).model_dump(mode="json"),
        ai_consent_json=(body.ai_consent or AiConsent()).model_dump(mode="json"),
        status="open",
    )
    db.add(matter)
    db.flush()
    set_scope(db, matter.id)
    audit.append(
        db, action="matter_create", entity_type="matter", entity_id=matter.id, user_id=me.user.id, matter_id=matter.id
    )
    return matter


def update(db: Session, me: Principal, matter: Matter, body: MatterUpdate) -> Matter:
    changed: list[str] = []
    for field in ("name", "client_name", "our_side", "court", "jurisdiction", "practice_area"):
        if field in body.model_fields_set:
            setattr(matter, field, getattr(body, field))
            changed.append(field)
    if body.profile is not None:
        matter.profile_json = body.profile.model_dump(mode="json")
        changed.append("profile")
    if body.ai_consent is not None:
        matter.ai_consent_json = body.ai_consent.model_dump(mode="json")
        changed.append("ai_consent")
    if changed:
        matter.last_activity_at = utcnow()
        audit.append(
            db,
            action="matter_update",
            entity_type="matter",
            entity_id=matter.id,
            user_id=me.user.id,
            matter_id=matter.id,
            details={"fields": changed},
        )
    return matter


def close(db: Session, me: Principal, matter: Matter) -> Matter:
    if matter.status != "closed":
        matter.status = "closed"
        matter.closed_at = utcnow()
        audit.append(
            db,
            action="matter_close",
            entity_type="matter",
            entity_id=matter.id,
            user_id=me.user.id,
            matter_id=matter.id,
        )
    return matter


def touch(matter: Matter) -> None:
    matter.last_activity_at = utcnow()


def _counts(db: Session, matter_id: str) -> MatterCounts:
    documents = db.execute(
        select(func.count(Document.id)).where(Document.matter_id == matter_id, Document.status != "quarantined")
    ).scalar_one()
    conversations = db.execute(
        select(func.count(Conversation.id)).where(Conversation.matter_id == matter_id)
    ).scalar_one()
    return MatterCounts(documents=documents, conversations=conversations)


def _usage(db: Session, matter_id: str) -> MatterUsage:
    tokens_in, tokens_out, latency = db.execute(
        select(
            func.coalesce(func.sum(Message.tokens_in), 0),
            func.coalesce(func.sum(Message.tokens_out), 0),
            func.coalesce(func.sum(Message.latency_ms), 0),
        ).where(Message.matter_id == matter_id)
    ).one()
    job_ms = 0
    for started, finished in db.execute(
        select(Job.started_at, Job.finished_at).where(
            Job.matter_id == matter_id, Job.started_at.is_not(None), Job.finished_at.is_not(None)
        )
    ):
        if started is not None and finished is not None:
            job_ms += int((finished - started).total_seconds() * 1000)
    return MatterUsage(
        tokens_in=int(tokens_in or 0), tokens_out=int(tokens_out or 0), compute_ms=int(latency or 0) + job_ms
    )


def to_out(db: Session, matter: Matter) -> MatterOut:
    return MatterOut(
        id=matter.id,
        name=matter.name,
        client_name=matter.client_name,
        our_side=matter.our_side,
        court=matter.court,
        jurisdiction=matter.jurisdiction,
        practice_area=matter.practice_area,
        profile=MatterProfile.model_validate(matter.profile_json or {}),
        ai_consent=AiConsent.model_validate(matter.ai_consent_json or {}),
        status=matter.status,  # type: ignore[arg-type]
        counts=_counts(db, matter.id),
        usage=_usage(db, matter.id),
        created_at=matter.created_at,
        closed_at=matter.closed_at,
        last_activity_at=matter.last_activity_at,
    )


def _opposing(profile: dict[str, Any] | None) -> dict[str, Any]:
    """The first opposing party in the profile, and its counsel if it has one."""
    party = next((p for p in (profile or {}).get("parties", []) if p.get("role") == "opposing"), None)
    if party is None:
        return {}
    counsel = party.get("counsel")
    return {
        "opposing_party": party.get("name"),
        "opposing_counsel": CounselBrief(name=counsel["name"], firm=counsel.get("firm")) if counsel else None,
    }


def list_for_user(
    db: Session, me: Principal, status: str, cursor: str | None, limit: int
) -> tuple[list[MatterSummaryOut], str | None]:
    """Open matters first, then most recently active. Counts span matters, so the query is explicitly unscoped
    and filtered by owner instead."""
    status_rank = func.iif(Matter.status == "open", 0, 1)
    stmt = select(Matter, status_rank.label("rank")).where(Matter.owner_user_id == me.user.id)
    if status in ("open", "closed"):
        stmt = stmt.where(Matter.status == status)
    after = decode_cursor(cursor)
    if after:
        rank, last_activity_iso, last_id = after
        last_activity = datetime.fromisoformat(last_activity_iso)
        stmt = stmt.where(
            or_(
                status_rank > rank,
                and_(status_rank == rank, Matter.last_activity_at < last_activity),
                and_(status_rank == rank, Matter.last_activity_at == last_activity, Matter.id < last_id),
            )
        )
    stmt = stmt.order_by(status_rank, Matter.last_activity_at.desc(), Matter.id.desc()).limit(limit + 1)
    rows = db.execute(stmt).all()
    page, more = rows[:limit], len(rows) > limit
    ids = [m.id for m, _ in page]
    with unscoped(db):
        doc_counts: dict[str, Any] = dict(
            db.execute(
                select(Document.matter_id, func.count(Document.id))
                .where(Document.matter_id.in_(ids), Document.status != "quarantined")
                .group_by(Document.matter_id)
            ).all()
        )
    items = [
        MatterSummaryOut(
            id=m.id,
            name=m.name,
            client_name=m.client_name,
            our_side=m.our_side,
            status=m.status,  # type: ignore[arg-type]
            document_count=int(doc_counts.get(m.id, 0)),
            last_activity_at=m.last_activity_at,
            court=m.court,
            practice_area=m.practice_area,
            **_opposing(m.profile_json),
        )
        for m, _ in page
    ]
    next_cursor = None
    if more and page:
        last, rank = page[-1]
        next_cursor = encode_cursor([rank, iso(last.last_activity_at), last.id])
    return items, next_cursor
