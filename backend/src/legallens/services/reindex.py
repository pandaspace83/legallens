"""Rebuild the vector index with the current embedding model (EMBEDDINGS_TODO.md, EMB-3.1).

Run it after changing the embedder. Each matter is embedded in short batches and its signature is recorded
only when every chunk has been re-embedded, so an interrupted run leaves the matter marked stale and search
keeps skipping the dense leg until the run is repeated.
"""

from collections.abc import Callable

from sqlalchemy import select, text

from legallens.db.engine import Database
from legallens.db.models import Chunk, Matter
from legallens.db.scope import set_scope, unscoped
from legallens.models.embedder import Embedder, to_blob
from legallens.search import index_guard

BATCH = 32


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
