"""Which embedding model built the vector index (D7).

Vectors from different models are not comparable, and a mismatch produces plausible-looking noise with no
error. Each matter's signature (the model that wrote its `chunks_vec` rows) is stored in `index_meta`; search and
ingestion compare it with the current embedder.

A database from before this table has no record. Those vectors were made by the hash embedder, so a missing
record with chunks present is read as the legacy hash signature.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.models.embedder import Embedder

LEGACY_SIGNATURE = "hash:hash:1024"


def _key(matter_id: str) -> str:
    return f"embedding:{matter_id}"


def signature(embedder: Embedder) -> str:
    return f"{embedder.kind}:{getattr(embedder, 'model_name', embedder.kind)}:{embedder.dim}"


def recorded(db: Session, matter_id: str) -> str | None:
    row = db.execute(text("SELECT value FROM index_meta WHERE key = :k"), {"k": _key(matter_id)}).first()
    return row[0] if row else None


def record(db: Session, matter_id: str, sig: str) -> None:
    db.execute(
        text(
            "INSERT INTO index_meta(key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ),
        {"k": _key(matter_id), "v": sig},
    )


def stored(db: Session, matter_id: str) -> str | None:
    """The signature this matter's index has: the record, the legacy hash if it has chunks, or None if empty."""
    found = recorded(db, matter_id)
    if found:
        return found
    has_chunks = (
        db.execute(
            text("SELECT 1 FROM chunks WHERE matter_id = :m AND kind != 'section' LIMIT 1"), {"m": matter_id}
        ).first()
        is not None
    )
    return LEGACY_SIGNATURE if has_chunks else None


def mismatch(db: Session, matter_id: str, embedder: Embedder) -> str | None:
    """A message when the matter's index was built by a different model, else None."""
    have = stored(db, matter_id)
    want = signature(embedder)
    if have is None or have == want:
        return None
    return f"The search index was built with {have}, but the current model is {want}. Run `legallens reindex`."


def expected_signature(settings: Settings) -> str:
    """The signature the configured embedder will write, known without loading the model."""
    if settings.embedder == "bge-m3":
        return f"bge-m3:{settings.embed_model}:{settings.embed_dim}"
    if settings.embedder == "ollama":
        return f"ollama:{settings.ollama_embed_model}:{settings.embed_dim}"
    return f"hash:hash:{settings.embed_dim}"


def stale_matters(db: Session, matter_ids: list[str], want: str) -> list[str]:
    return [m for m in matter_ids if (have := stored(db, m)) is not None and have != want]
