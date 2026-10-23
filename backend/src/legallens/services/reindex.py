"""Rebuild the vector index with the current embedding model (EMBEDDINGS_TODO.md, EMB-3.1).

Run it after changing the embedder, or once to give documents uploaded before the caption label existed the same
retrieval header a new upload gets (a cover page's docket number, date filed and counsel become findable).
Each matter is embedded in short batches and its signature is recorded only when every chunk has been
re-embedded, so an interrupted run leaves the matter marked stale and search keeps skipping the dense leg
until the run is repeated.
"""

from collections.abc import Callable

from sqlalchemy import select, text

from legallens.db.engine import Database
from legallens.db.models import Chunk, Matter
from legallens.db.scope import set_scope, unscoped
from legallens.ingestion.chunker import CAPTION_CHUNKS, CAPTION_LABEL, CAPTION_MAX_TOKENS
from legallens.models.embedder import Embedder, to_blob
from legallens.search import index_guard

BATCH = 32


def relabel_captions(database: Database, matter_id: str) -> int:
    """Adds the caption label to the cover-page chunks of the matter's documents, the way the chunker does for a new
    upload. Returns how many headers changed; already-labelled chunks are left alone."""
    changed = 0
    with database.write() as db:
        set_scope(db, matter_id)
        for document_id in db.execute(select(Chunk.document_id).distinct()).scalars().all():
            texts = db.execute(
                select(Chunk).where(Chunk.document_id == document_id, Chunk.kind == "text").order_by(Chunk.seq)
            ).scalars()
            for position, chunk in enumerate(texts):
                if (
                    chunk.page_start != 1
                    or chunk.clause_ref
                    or chunk.token_count > CAPTION_MAX_TOKENS
                    or position == CAPTION_CHUNKS
                ):
                    break
                parent = db.get(Chunk, chunk.parent_chunk_id) if chunk.parent_chunk_id else None
                for target in (chunk, parent):
                    if target is not None and CAPTION_LABEL not in target.header:
                        target.header = f"{target.header} › {CAPTION_LABEL}"
                        changed += 1
    return changed


def reindex(
    database: Database,
    embedder: Embedder,
    *,
    matter_id: str | None = None,
    progress: Callable[[str, int, int], None] | None = None,
) -> dict[str, int]:
    """Returns {matter_id: chunks re-embedded}."""
    with database.read() as db, unscoped(db):
        matters = list(db.execute(select(Matter.id).order_by(Matter.id)).scalars())
    if matter_id is not None:
        if matter_id not in matters:
            raise ValueError(f"No matter with id {matter_id}.")
        matters = [matter_id]

    sig = index_guard.signature(embedder)
    done: dict[str, int] = {}
    for mid in matters:
        relabel_captions(database, mid)
        with database.read() as db:
            set_scope(db, mid)
            rows = db.execute(
                select(Chunk.id, Chunk.document_id, Chunk.header, Chunk.text)
                .where(Chunk.matter_id == mid, Chunk.kind != "section")
                .order_by(Chunk.id)
            ).all()
        for start in range(0, len(rows), BATCH):
            batch = rows[start : start + BATCH]
            vectors = embedder.embed([f"{header}\n{body}" for _, _, header, body in batch])
            with database.write() as db:
                set_scope(db, mid)
                for (chunk_id, document_id, _, _), vector in zip(batch, vectors, strict=True):
                    db.execute(text("DELETE FROM chunks_vec WHERE rowid = :r"), {"r": chunk_id})
                    db.execute(
                        text(
                            "INSERT INTO chunks_vec(rowid, matter_id, document_id, embedding) VALUES (:r, :m, :d, :e)"
                        ),
                        {"r": chunk_id, "m": mid, "d": document_id, "e": to_blob(vector)},
                    )
            if progress:
                progress(mid, start + len(batch), len(rows))
        with database.write() as db:
            set_scope(db, mid)
            index_guard.record(db, mid, sig)
        done[mid] = len(rows)
    return done
