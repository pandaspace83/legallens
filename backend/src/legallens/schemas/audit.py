"""H · Audit and operations."""

from typing import Any, Literal

from legallens.schemas.common import ResponseModel, Timestamp


class AuditEntryOut(ResponseModel):
    id: int
    ts: Timestamp
    user_id: str | None = None
    matter_id: str | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    details: dict[str, Any]
    prev_hash: str
    hash: str


class AuditPage(ResponseModel):
    items: list[AuditEntryOut]
    next_cursor: str | None = None
    chain_valid: bool


class ComponentHealth(ResponseModel):
    kind: str
    ok: bool
    detail: str | None = None


class HealthOut(ResponseModel):
    status: Literal["ok", "degraded"]
    version: str
    db: ComponentHealth
    sqlite_vec: ComponentHealth
    fts5: ComponentHealth
    worker: ComponentHealth
    scanner: ComponentHealth
    embedder: ComponentHealth
    converter: ComponentHealth
    orchestrator: ComponentHealth
    storage: ComponentHealth
