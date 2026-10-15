"""Real deletion (DEC-34, DEC-58).

One transaction removes the rows; foreign-key cascades remove pages, chunks, citations, defined terms and
summaries, and triggers on `chunks` remove the FTS5 rows and the vectors. Files are removed after the commit,
so a failed transaction never leaves rows pointing at missing files. The audit row keeps IDs and counts only.
"""

import logging
import shutil

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.models import (
    Chunk,
    Conversation,
    DefinedTerm,
    DocPage,
    Document,
    Draft,
    DraftVersion,
    Job,
    Matter,
    Message,
    MessageCitation,
    Summary,
)
from legallens.db.scope import unscoped
from legallens.schemas.documents import DeletionReport, RemovedCounts
from legallens.services import audit
from legallens.services.auth import Principal
from legallens.storage.files import LocalFileStore, open_store

log = logging.getLogger("legallens.deletion")


def _descendants(db: Session, document_id: str) -> list[str]:
    """The document plus any attachments split out of it (an email's attachments), recursively."""
    ids = [document_id]
    frontier = [document_id]
    while frontier:
        children = list(db.execute(select(Document.id).where(Document.parent_document_id.in_(frontier))).scalars())
        ids.extend(children)
        frontier = children
    return ids


def _count(db: Session, stmt: object) -> int:
    return int(db.execute(stmt).scalar() or 0)  # type: ignore[call-overload]


def _vector_count(db: Session, chunk_ids: list[int]) -> int:
    total = 0
    for start in range(0, len(chunk_ids), 500):
        batch = chunk_ids[start : start + 500]
        params = {f"r{i}": rowid for i, rowid in enumerate(batch)}
        placeholders = ", ".join(f":r{i}" for i in range(len(batch)))
        total += int(
            db.execute(text(f"SELECT count(*) FROM chunks_vec WHERE rowid IN ({placeholders})"), params).scalar() or 0
        )
    return total


def _cancel_jobs(db: Session, document_ids: list[str]) -> None:
    for job in db.execute(select(Job).where(Job.document_id.in_(document_ids), Job.status == "running")).scalars():
        job.cancel_requested = True


def _scrub_drafts(db: Session, document_ids: set[str]) -> None:
    """Drafts are the lawyer's work product and stay, but they lose their links to the deleted documents."""
    for draft in db.execute(select(Draft)).scalars():
        supporting = [d for d in draft.supporting_document_ids_json or [] if d not in document_ids]
        if supporting != draft.supporting_document_ids_json:
            draft.supporting_document_ids_json = supporting
    for version in db.execute(select(DraftVersion)).scalars():
        content = version.content_json or {}
        changed = False
        for section in content.get("sections", []):
            kept = [c for c in section.get("citations", []) if c.get("document_id") not in document_ids]
            if len(kept) != len(section.get("citations", [])):
                section["citations"] = kept
                changed = True
        for claim in content.get("claims", []):
            if (claim.get("source") or {}).get("document_id") in document_ids:
                claim["source"] = None
                changed = True
        if changed:
            version.content_json = dict(content)


def document_report(db: Session, store: LocalFileStore, document: Document, *, dry_run: bool) -> DeletionReport:
    ids = _descendants(db, document.id)
    chunk_ids = list(db.execute(select(Chunk.id).where(Chunk.document_id.in_(ids))).scalars())
    docs = list(db.execute(select(Document).where(Document.id.in_(ids))).scalars())
    removed = RemovedCounts(
        documents=len(ids),
        pages=_count(db, select(func.count(DocPage.id)).where(DocPage.document_id.in_(ids))),
        chunks=len(chunk_ids),
        fts_rows=_count(db, select(func.count(Chunk.id)).where(Chunk.document_id.in_(ids), Chunk.kind != "section")),
        vectors=_vector_count(db, chunk_ids),
        citations=_count(db, select(func.count(MessageCitation.id)).where(MessageCitation.document_id.in_(ids))),
        conversations=_count(
            db,
            select(func.count(func.distinct(Message.conversation_id)))
            .join(MessageCitation, MessageCitation.message_id == Message.id)
            .where(MessageCitation.document_id.in_(ids)),
        ),
        defined_terms=_count(db, select(func.count(DefinedTerm.id)).where(DefinedTerm.document_id.in_(ids))),
        summaries=_count(db, select(func.count(Summary.id)).where(Summary.document_id.in_(ids))),
        file_bytes=sum(store.size(d.storage_path) for d in docs),
    )
    return DeletionReport(document_id=document.id, dry_run=dry_run, removed=removed)


def delete_document(
    db: Session, settings: Settings, me: Principal, document: Document, *, dry_run: bool
) -> DeletionReport:
    store = open_store(settings)
    report = document_report(db, store, document, dry_run=dry_run)
    if dry_run:
        return report
    ids = _descendants(db, document.id)
    paths = list(db.execute(select(Document.storage_path).where(Document.id.in_(ids))).scalars())
    matter_id = document.matter_id
    _cancel_jobs(db, ids)
    _scrub_drafts(db, set(ids))
    db.execute(delete(Document).where(Document.id.in_(ids)), execution_options={"synchronize_session": False})
    audit.append(
        db,
        action="delete",
        entity_type="document",
        entity_id=document.id,
        user_id=me.user.id,
        matter_id=matter_id,
        details=report.removed.model_dump(),
    )
    db.commit()
    for path in paths:
        try:
            store.delete(path)
        except OSError:
            log.warning("file_delete_failed", extra={"document_id": document.id})
    return report


def delete_matter(db: Session, settings: Settings, me: Principal, matter: Matter) -> dict[str, int]:
    matter_id = matter.id
    counts = {
        "documents": _count(db, select(func.count(Document.id)).where(Document.matter_id == matter_id)),
        "conversations": _count(db, select(func.count(Conversation.id)).where(Conversation.matter_id == matter_id)),
        "chunks": _count(db, select(func.count(Chunk.id)).where(Chunk.matter_id == matter_id)),
        "drafts": _count(db, select(func.count(Draft.id)).where(Draft.matter_id == matter_id)),
    }
    for job in db.execute(select(Job).where(Job.status == "running")).scalars():
        job.cancel_requested = True
    db.flush()
    with unscoped(db):
        db.execute(delete(Matter).where(Matter.id == matter_id))
    audit.append(
        db,
        action="delete",
        entity_type="matter",
        entity_id=matter_id,
        user_id=me.user.id,
        matter_id=matter_id,
        details=counts,
    )
    db.commit()
    open_store(settings).delete_matter(matter_id)
    exports_dir = settings.exports_dir / matter_id
    if exports_dir.exists():
        shutil.rmtree(exports_dir, ignore_errors=True)
    log.info("matter_deleted", extra={"matter_id": matter_id, **counts})
    return counts
