"""Embedding model, reranker, index guard and reindex (EMBEDDINGS_TODO.md Phase 4).

These run on fakes and the hash embedder, so they need no model download. The real models are in
tests/slow/test_real_models.py.
"""

import asyncio
from pathlib import Path
from typing import Any

import pytest

from legallens.db.scope import set_scope
from legallens.models import hf
from legallens.models.embedder import BgeM3Embedder, HashEmbedder, get_embedder
from legallens.models.reranker import BgeReranker, NoopReranker, get_reranker
from legallens.search import index_guard
from legallens.search.hybrid import hybrid_search
from legallens.services.chat import BackendRunServices
from legallens.services.reindex import reindex
from tests.conftest import Api, make_settings

# ---------------------------------------------------------------- models on fakes


class FakeCrossEncoder:
    """Stands in for sentence_transformers.CrossEncoder, which already returns 0-1 probabilities."""

    def __init__(self, scores: list[float]) -> None:
        self.scores = scores
        self.seen: list[tuple[str, str]] = []

    def predict(self, pairs: list[tuple[str, str]], **_: Any) -> list[float]:
        self.seen = pairs
        return self.scores[: len(pairs)]


class FakeEncoder:
    def encode(self, texts: list[str], **_: Any) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]

    def get_embedding_dimension(self) -> int:
        return 3


class WordReranker:
    """Scores a passage by how many of the query's words it contains."""

    kind = "fake"

    def score(self, query: str, passages: list[str]) -> list[float]:
        words = set(query.lower().split())
        return [len(words & set(p.lower().split())) / max(len(words), 1) for p in passages]

    def ping(self) -> bool:
        return True


def test_noop_reranker_keeps_the_given_order() -> None:
    scores = NoopReranker().score("q", ["a", "b", "c"])
    assert scores == sorted(scores, reverse=True)
    assert len(set(scores)) == 3
    assert NoopReranker().score("q", []) == []


def test_bge_reranker_passes_scores_through_unchanged() -> None:
    model = FakeCrossEncoder([0.9, 0.0001])
    reranker = BgeReranker(model)
    assert reranker.score("notice period", ["30 days", "pancakes"]) == [0.9, 0.0001]  # no second sigmoid
    assert model.seen == [("notice period", "30 days"), ("notice period", "pancakes")]
    assert reranker.score("q", []) == []


def test_bge_embedder_returns_plain_float_lists() -> None:
    embedder = BgeM3Embedder(FakeEncoder(), dim=3)
    assert embedder.embed(["a", "b"]) == [[1.0, 0.0, 0.0], [1.0, 0.0, 0.0]]
    assert embedder.embed([]) == []
    assert (embedder.kind, embedder.dim) == ("bge-m3", 3)


def test_settings_pick_the_models(tmp_path: Path) -> None:
    settings = make_settings(tmp_path)
    assert isinstance(get_embedder(settings), HashEmbedder)
    assert isinstance(get_reranker(settings), NoopReranker)
    assert settings.k_per_leg == 25
    assert settings.k_fused == 50
    assert settings.rerank_top_n == 8
    assert settings.models_path == tmp_path / "models" / "hf"


def test_a_missing_download_says_how_to_fix_it(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, embedder="bge-m3", reranker="bge")
    with pytest.raises(FileNotFoundError, match="legallens models download"):
        get_embedder(settings)
    with pytest.raises(FileNotFoundError, match="legallens models download"):
        get_reranker(settings)


def test_models_load_once_per_process(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, model_device="cpu")
    folder = hf.model_dir(settings, "acme/tiny")
    folder.mkdir(parents=True)
    (folder / "config.json").write_text("{}")
    built: list[str] = []

    def factory(path: Path, device: str) -> object:
        built.append(device)
        return object()

    hf.clear_cache()
    first = hf.load_cached(settings, "acme/tiny", "embedder", factory)
    second = hf.load_cached(settings, "acme/tiny", "embedder", factory)
    hf.clear_cache()
    assert first is second
    assert built == ["cpu"]


# ---------------------------------------------------------------- rerank service


def _services(api: Api, matter_id: str, reranker: Any) -> BackendRunServices:
    services = BackendRunServices(
        api.database, api.settings, matter_id=matter_id, user_id="user", conversation_id="conv"
    )
    services.reranker = reranker
    return services


def test_rerank_scores_every_hit_and_returns_the_best_with_context(api: Api) -> None:
    matter = api.create_matter()
    api.ingest(matter["id"], "smith_msa_v3.pdf")
    services = _services(api, matter["id"], WordReranker())
    query = "Termination for convenience"

    result = asyncio.run(services.search(query, None))
    assert len(result.hits) > 3
    best = asyncio.run(services.rerank(query, result.hits, 3))

    assert len(best) == 3
    assert all(h.rerank_score is not None for h in result.hits)  # all candidates were scored
    assert [h.rerank_score for h in best] == sorted((h.rerank_score for h in best), reverse=True)
    assert best[0].rerank_score == max(h.rerank_score or 0 for h in result.hits)
    assert all(h.context for h in best)  # expanded after the rerank, so context belongs to the final hits
    assert "rerank" in best[0].trace()


def test_rerank_with_no_hits_is_empty(api: Api) -> None:
    matter = api.create_matter()
    assert asyncio.run(_services(api, matter["id"], WordReranker()).rerank("q", [], 8)) == []


# ---------------------------------------------------------------- index guard and reindex


def test_a_stale_index_skips_the_dense_leg_until_reindexed(api: Api) -> None:
    matter = api.create_matter()
    api.ingest(matter["id"], "smith_msa_v3.pdf")
    embedder = get_embedder(api.settings)
    mid = matter["id"]

    def run() -> Any:
        with api.database.read() as db:
            set_scope(db, mid)
            return hybrid_search(db, embedder, matter_id=mid, query="termination notice")

    fresh = run()
    assert fresh.vector and fresh.dense_skipped is None
    assert index_guard.signature(embedder).startswith("hash:")

    with api.database.write() as db:
        set_scope(db, mid)
        index_guard.record(db, mid, "bge-m3:BAAI/bge-m3:1024")  # as if another model had built it
    stale = run()
    assert stale.vector == []
    assert stale.dense_skipped and "legallens reindex" in stale.dense_skipped
    assert stale.bm25  # the keyword leg still answers

    done = reindex(api.database, embedder, matter_id=mid)
    assert done[mid] > 0
    healed = run()
    assert healed.vector and healed.dense_skipped is None


def test_ingestion_refuses_to_mix_models(api: Api) -> None:
    matter = api.create_matter()
    api.ingest(matter["id"], "smith_msa_v3.pdf")
    with api.database.write() as db:
        set_scope(db, matter["id"])
        index_guard.record(db, matter["id"], "bge-m3:BAAI/bge-m3:1024")

    upload = api.upload(matter["id"], "acme_demand_letter_scanned.pdf")
    api.run_jobs()
    job = api.client.get(f"/api/v1/jobs/{upload.json()['job_id']}").json()
    assert job["status"] == "failed"
    assert "reindex" in str(job).lower()


def test_reindex_rejects_an_unknown_matter(api: Api) -> None:
    with pytest.raises(ValueError, match="No matter"):
        reindex(api.database, get_embedder(api.settings), matter_id="mat_missing")


def test_reindex_gives_an_older_documents_cover_chunks_the_caption_label(api: Api) -> None:
    from sqlalchemy import select, text

    from legallens.db.models import Chunk
    from legallens.ingestion.chunker import CAPTION_LABEL

    matter = api.create_matter()
    mid = matter["id"]
    api.ingest(mid, "smith_msa_v3.pdf")
    with api.database.write() as db:
        set_scope(db, mid)
        first = db.execute(select(Chunk).where(Chunk.kind == "text").order_by(Chunk.seq)).scalars().first()
        assert first is not None
        # As a cover chunk uploaded before the label existed: short, on page 1, no clause number, no label.
        first.page_start, first.clause_ref, first.token_count = 1, None, 10
        first.header = first.header.replace(f" › {CAPTION_LABEL}", "")
        first_id = first.id
    reindex(api.database, get_embedder(api.settings), matter_id=mid)
    with api.database.read() as db:
        set_scope(db, mid)
        assert CAPTION_LABEL in db.get(Chunk, first_id).header  # type: ignore[union-attr]
        hits = db.execute(text("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'docket'")).all()
        assert first_id in [r[0] for r in hits], "the keyword index sees the new header words"
    again = reindex(api.database, get_embedder(api.settings), matter_id=mid)
    assert again[mid] > 0
    with api.database.read() as db:
        set_scope(db, mid)
        assert db.get(Chunk, first_id).header.count(CAPTION_LABEL) == 1  # type: ignore[union-attr]
