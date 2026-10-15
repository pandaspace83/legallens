"""H · Audit: the append-only, hash-chained log for one matter, as JSON pages or a JSONL download (DEC-68)."""

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response
from sqlalchemy import select

from legallens.api.deps import CurrentUser, ReadDB, load_matter
from legallens.db.models import AuditLog
from legallens.schemas.audit import AuditEntryOut, AuditPage
from legallens.schemas.common import problem_responses
from legallens.services.audit import verify_chain
from legallens.timeutil import iso

router = APIRouter(tags=["H · Audit"])


def _entry(row: AuditLog) -> AuditEntryOut:
    return AuditEntryOut(
        id=row.id,
        ts=row.ts,
        user_id=row.user_id,
        matter_id=row.matter_id,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        details=row.details_json or {},
        prev_hash=row.prev_hash,
        hash=row.hash,
    )


@router.get(
    "/matters/{matter_id}/audit",
    operation_id="getAuditLog",
    response_model=None,
    responses={200: {"model": AuditPage}, **problem_responses(401, 403, 404)},
)
def get_audit_log(
    matter_id: str,
    me: CurrentUser,
    db: ReadDB,
    cursor: int | None = Query(None, description="Return entries after this id."),
    action: str | None = Query(None, max_length=40),
    since: datetime | None = None,
    limit: int = Query(100, ge=1, le=1000),
    format: Literal["json", "jsonl"] = "json",
) -> AuditPage | Response:
    matter = load_matter(db, me, matter_id)
    stmt = select(AuditLog).where(AuditLog.matter_id == matter.id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if since:
        stmt = stmt.where(AuditLog.ts >= since)
    if cursor:
        stmt = stmt.where(AuditLog.id > cursor)
    valid, _ = verify_chain(db)
    if format == "jsonl":
        everything = db.execute(stmt.order_by(AuditLog.id)).scalars()
        lines = [json.dumps({**_entry(r).model_dump(mode="json"), "ts": iso(r.ts)}) for r in everything]
        return Response(
            "\n".join(lines) + "\n",
            media_type="application/x-ndjson",
            headers={
                "Content-Disposition": f'attachment; filename="audit-{matter.id}.jsonl"',
                "X-Audit-Chain-Valid": "true" if valid else "false",
            },
        )
    rows = list(db.execute(stmt.order_by(AuditLog.id).limit(limit + 1)).scalars())
    page = rows[:limit]
    next_cursor = str(page[-1].id) if len(rows) > limit and page else None
    return AuditPage(items=[_entry(r) for r in page], next_cursor=next_cursor, chain_valid=valid)
