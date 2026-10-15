"""Hash-chained, append-only audit log (DEC-68).

Each row's hash covers its content and the previous row's hash, so editing or removing any row breaks the
chain from that point on. Details hold IDs, counts, codes and enums only: never client text (RISK-12).
Callers must hold a write transaction (BEGIN IMMEDIATE), which serialises appends across processes.
"""

import hashlib
import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from legallens.db.models import AuditLog
from legallens.timeutil import iso, utcnow

GENESIS = "0" * 64
_SAFE_STRING = re.compile(r"^[A-Za-z0-9_.:\-/]{0,80}$")


class AuditDetailError(ValueError):
    pass


def _check_details(value: Any, path: str = "details") -> None:
    if value is None or isinstance(value, bool | int | float):
        return
    if isinstance(value, str):
        if not _SAFE_STRING.match(value):
            raise AuditDetailError(f"{path} looks like free text; audit details hold IDs, counts and enums only.")
        return
    if isinstance(value, list | tuple):
        for i, item in enumerate(value):
            _check_details(item, f"{path}[{i}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            _check_details(item, f"{path}.{key}")
        return
    raise AuditDetailError(f"{path} has an unsupported type {type(value).__name__}.")


def _digest(prev_hash: str, row: AuditLog) -> str:
    payload = {
        "ts": iso(row.ts),
        "user_id": row.user_id,
        "matter_id": row.matter_id,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.details_json,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{prev_hash}|{canonical}".encode()).hexdigest()


def append(
    session: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    user_id: str | None = None,
    matter_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditLog:
    details = details or {}
    _check_details(details)
    prev_hash = session.execute(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1)).scalar() or GENESIS
    row = AuditLog(
        ts=utcnow(),
        user_id=user_id,
        matter_id=matter_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details_json=details,
        prev_hash=prev_hash,
        hash="",
    )
    row.hash = _digest(prev_hash, row)
    session.add(row)
    session.flush()
    return row


def verify_chain(session: Session) -> tuple[bool, int | None]:
    """Returns (valid, id of the first broken row)."""
    prev = GENESIS
    for row in session.execute(select(AuditLog).order_by(AuditLog.id)).scalars():
        if row.prev_hash != prev or _digest(prev, row) != row.hash:
            return False, row.id
        prev = row.hash
    return True, None
