"""Hybrid search inside SQLite: FTS5 BM25 + sqlite-vec KNN, merged by reciprocal rank fusion (TA frame 5).

Both legs filter by matter inside SQL (DEC-53): the sparse leg joins `chunks` on matter_id, and the dense leg
uses the vec0 partition key. A "This document" scope adds document_id to both, again inside SQL.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from legallens.db.models import Chunk, DefinedTerm, Document
from legallens.models.embedder import Embedder, to_blob
from legallens.search import index_guard
from legallens.search.fts import build_fts_query

log = logging.getLogger(__name__)

RRF_K = 60
K_PER_LEG = 25
K_FUSED = 50


@dataclass
class Hit:
    chunk_id: int
    document_id: str
    document_name: str
    kind: str
    seq: int
    header: str
    section_path: str | None
    clause_ref: str | None
    para_ref: str | None
    page_start: int
    page_end: int
    text: str
    bbox: list[Any]
    parent_chunk_id: int | None
    rrf: float = 0.0
    bm25_rank: int | None = None
    bm25_score: float | None = None
    vec_rank: int | None = None
    distance: float | None = None
    context: dict[str, Any] = field(default_factory=dict)
    rerank_score: float | None = None  # cross-encoder relevance, 0-1; set by RunServices.rerank

    def trace(self) -> dict[str, Any]:
        entry: dict[str, Any] = {
            "chunk_id": self.chunk_id,
            "rrf": round(self.rrf, 6),
            "bm25_rank": self.bm25_rank,
            "vec_rank": self.vec_rank,
        }
        if self.rerank_score is not None:
            entry["rerank"] = round(self.rerank_score, 4)
        return entry


@dataclass
class SearchResult:
    query: str
    fts_query: str | None
    hits: list[Hit]
    bm25: list[tuple[int, float]]
    vector: list[tuple[int, float]]
    document_ids: list[str] | None
    dense_skipped: str | None = None  # why the vector leg did not run (index built by another model)


def _in_clause(prefix: str, values: list[str]) -> tuple[str, dict[str, str]]:
    params = {f"{prefix}{i}": v for i, v in enumerate(values)}
    return ", ".join(f":{k}" for k in params), params


def sparse_leg(
    db: Session, *, matter_id: str, fts_query: str, document_ids: list[str] | None, k: int
) -> list[tuple[int, float]]:
    params: dict[str, Any] = {"q": fts_query, "m": matter_id, "k": k}
    doc_filter = ""
    if document_ids:
        placeholders, doc_params = _in_clause("d", document_ids)
        doc_filter = f" AND c.document_id IN ({placeholders})"
        params.update(doc_params)
    sql = (
        "SELECT c.id, bm25(chunks_fts) AS score FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid "
        f"WHERE chunks_fts MATCH :q AND c.matter_id = :m{doc_filter} ORDER BY score LIMIT :k"
    )
    return [(int(r[0]), float(r[1])) for r in db.execute(text(sql), params)]


def dense_leg(
    db: Session, *, matter_id: str, vector: list[float], document_ids: list[str] | None, k: int
) -> list[tuple[int, float]]:
    params: dict[str, Any] = {"v": to_blob(vector), "m": matter_id, "k": k}
    doc_filter = ""
    if document_ids:
        placeholders, doc_params = _in_clause("d", document_ids)
        doc_filter = f" AND document_id IN ({placeholders})"
        params.update(doc_params)
    sql = (
        "SELECT rowid, distance FROM chunks_vec "
        f"WHERE embedding MATCH :v AND k = :k AND matter_id = :m{doc_filter} ORDER BY distance"
    )
    return [(int(r[0]), float(r[1])) for r in db.execute(text(sql), params)]


def rrf_fuse(*legs: list[tuple[int, float]], k: int = RRF_K) -> list[tuple[int, float]]:
    scores: dict[int, float] = {}
    for leg in legs:
        for rank, (chunk_id, _) in enumerate(leg, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def _load_hits(db: Session, matter_id: str, chunk_ids: list[int]) -> dict[int, Hit]:
    if not chunk_ids:
        return {}
    rows = db.execute(
        select(Chunk, Document.filename)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.id.in_(chunk_ids), Chunk.matter_id == matter_id)
    ).all()
    return {
        chunk.id: Hit(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_name=filename,
            kind=chunk.kind,
            seq=chunk.seq,
            header=chunk.header,
            section_path=chunk.section_path,
            clause_ref=chunk.clause_ref,
            para_ref=chunk.para_ref,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            text=chunk.text,
            bbox=chunk.bbox_json or [],
            parent_chunk_id=chunk.parent_chunk_id,
        )
        for chunk, filename in rows
    }


def hybrid_search(
    db: Session,
    embedder: Embedder,
    *,
    matter_id: str,
    query: str,
    document_ids: list[str] | None = None,
    k_leg: int = K_PER_LEG,
    k_fused: int = K_FUSED,
) -> SearchResult:
    if not matter_id:
        raise ValueError("hybrid_search needs a matter_id (DEC-53).")
    fts_query = build_fts_query(query)
    bm25 = (
        sparse_leg(db, matter_id=matter_id, fts_query=fts_query, document_ids=document_ids, k=k_leg)
        if fts_query
        else []
    )
    stale = index_guard.mismatch(db, matter_id, embedder)
    if stale:
        log.warning("dense_leg_skipped", extra={"reason": stale})
        vector: list[tuple[int, float]] = []
    else:
        vector = dense_leg(
            db, matter_id=matter_id, vector=embedder.embed([query])[0], document_ids=document_ids, k=k_leg
        )
    fused = rrf_fuse(bm25, vector)[:k_fused]
    loaded = _load_hits(db, matter_id, [chunk_id for chunk_id, _ in fused])
    bm25_rank = {cid: (rank, score) for rank, (cid, score) in enumerate(bm25, start=1)}
    vec_rank = {cid: (rank, dist) for rank, (cid, dist) in enumerate(vector, start=1)}
    hits: list[Hit] = []
    for chunk_id, score in fused:
        hit = loaded.get(chunk_id)
        if hit is None:  # a row from another matter can never load here; skip defensively
            continue
        hit.rrf = score
        if chunk_id in bm25_rank:
            hit.bm25_rank, hit.bm25_score = bm25_rank[chunk_id]
        if chunk_id in vec_rank:
            hit.vec_rank, hit.distance = vec_rank[chunk_id]
        hits.append(hit)
    return SearchResult(
        query=query,
        fts_query=fts_query,
        hits=hits,
        bm25=bm25,
        vector=vector,
        document_ids=document_ids,
        dense_skipped=stale,
    )


def expand(db: Session, matter_id: str, hits: list[Hit], max_chars: int = 4000) -> None:
    """Adds each passage's parent section, neighbouring chunks and the definitions of defined terms it uses."""
    if not hits:
        return
    terms = db.execute(
        select(DefinedTerm.term, DefinedTerm.definition_text, DefinedTerm.document_id).where(
            DefinedTerm.matter_id == matter_id
        )
    ).all()
    for hit in hits:
        parent = db.get(Chunk, hit.parent_chunk_id) if hit.parent_chunk_id else None
        neighbours = db.execute(
            select(Chunk.seq, Chunk.text).where(
                Chunk.matter_id == matter_id,
                Chunk.document_id == hit.document_id,
                Chunk.kind != "section",
                Chunk.seq.in_([hit.seq - 1, hit.seq + 1]),
            )
        ).all()
        definitions = [
            {"term": term, "definition": definition[:500]}
            for term, definition, doc_id in terms
            if doc_id == hit.document_id and term.lower() in hit.text.lower()
        ]
        hit.context = {
            "section": (parent.text[:max_chars] if parent else None),
            "before": next((t for s, t in neighbours if s == hit.seq - 1), None),
            "after": next((t for s, t in neighbours if s == hit.seq + 1), None),
            "definitions": definitions[:5],
        }
