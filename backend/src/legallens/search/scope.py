"""Scope: which documents a question searches, and the "Searching: …" label shown with it (DEC-35)."""

from dataclasses import dataclass
from pathlib import PurePath

from sqlalchemy import select
from sqlalchemy.orm import Session

from legallens.db.models import Document
from legallens.errors import ApiError
from legallens.schemas.common import Scope


@dataclass
class ResolvedScope:
    kind: str
    document_ids: list[str] | None  # None = every ready document in the matter
    documents: list[Document]
    label: str


def display_name(filename: str) -> str:
    return PurePath(filename).stem


def label_for(documents: list[Document], all_documents: bool) -> str:
    if not documents:
        return "No documents are ready in this matter yet"
    if all_documents:
        n = len(documents)
        return f"All {n} document{'s' if n != 1 else ''} in this matter"
    names = [display_name(d.filename) for d in documents]
    if len(names) <= 3:
        return " + ".join(names)
    return f"{' + '.join(names[:2])} + {len(names) - 2} more"


def resolve_scope(db: Session, matter_id: str, scope: Scope) -> ResolvedScope:
    ready = list(
        db.execute(
            select(Document)
            .where(Document.matter_id == matter_id, Document.status == "ready")
            .order_by(Document.uploaded_at, Document.id)
        ).scalars()
    )
    if scope.kind == "all":
        return ResolvedScope("all", None, ready, label_for(ready, all_documents=True))
    if not scope.document_ids:
        raise ApiError(422, "invalid_scope", "Pick at least one document, or search all documents in the matter.")
    by_id = {d.id: d for d in ready}
    missing = [d for d in scope.document_ids if d not in by_id]
    if missing:
        raise ApiError(
            422,
            "invalid_scope",
            "Some documents in the scope are not in this matter or are not ready yet.",
            document_ids=missing,
        )
    chosen = [by_id[d] for d in dict.fromkeys(scope.document_ids)]
    return ResolvedScope("documents", [d.id for d in chosen], chosen, label_for(chosen, all_documents=False))
