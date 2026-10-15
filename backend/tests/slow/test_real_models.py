"""bge-m3 and bge-reranker-v2-m3 for real. Run with `pytest -m slow` after `legallens models download`."""

import math

import pytest

from legallens.config import Settings, default_data_dir
from legallens.models.embedder import BgeM3Embedder
from legallens.models.reranker import BgeReranker

pytestmark = pytest.mark.slow

MODELS = default_data_dir() / "models" / "hf"


@pytest.fixture(scope="module")
def settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    if not (MODELS / "BAAI--bge-m3").is_dir() or not (MODELS / "BAAI--bge-reranker-v2-m3").is_dir():
        pytest.skip("Models are not downloaded (uv run legallens models download --what embeddings)")
    return Settings(env="test", data_dir=tmp_path_factory.mktemp("data"), models_dir=MODELS, model_device="cpu")


def test_bge_m3_returns_1024_dimension_unit_vectors(settings: Settings) -> None:
    embedder = BgeM3Embedder.load(settings)
    vectors = embedder.embed(["The tenant must give 30 days written notice.", "Governing law is California."])
    assert embedder.dim == 1024
    assert [len(v) for v in vectors] == [1024, 1024]
    for vector in vectors:
        assert math.sqrt(sum(x * x for x in vector)) == pytest.approx(1.0, abs=1e-3)


def test_bge_m3_puts_the_relevant_clause_nearest(settings: Settings) -> None:
    embedder = BgeM3Embedder.load(settings)
    query, relevant, unrelated = embedder.embed(
        [
            "How much notice is needed to end the agreement?",
            "Either party may terminate on thirty (30) days' written notice.",
            "The Supplier shall carry public liability insurance of at least $2,000,000.",
        ]
    )

    def cosine(a: list[float], b: list[float]) -> float:
        return sum(x * y for x, y in zip(a, b, strict=True))

    assert cosine(query, relevant) > cosine(query, unrelated)


def test_reranker_ranks_the_relevant_clause_first_with_scores_in_0_1(settings: Settings) -> None:
    reranker = BgeReranker.load(settings)
    passages = [
        "The Supplier shall carry public liability insurance of at least $2,000,000.",
        "Either party may terminate on thirty (30) days' written notice.",
        "This Agreement is governed by the laws of California.",
    ]
    scores = reranker.score("How much notice is needed to end the agreement?", passages)
    assert all(0.0 <= s <= 1.0 for s in scores)
    assert scores.index(max(scores)) == 1
    assert max(scores) > 0.5 > sorted(scores)[0]
