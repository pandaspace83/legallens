"""Cross-encoder reranker (D4). Scores each (query, passage) pair jointly, which is far more precise than the
bi-encoder similarity used to fetch the candidates.

BgeReranker runs BAAI/bge-reranker-v2-m3 in-process. NoopReranker keeps the incoming order and is what tests
and a `reranker=none` install use.
"""

from typing import Protocol

from legallens.config import Settings
from legallens.models import hf

MAX_LENGTH = 1024


class Reranker(Protocol):
    kind: str

    def score(self, query: str, passages: list[str]) -> list[float]:
        """One relevance score in [0, 1] per passage, in the order given."""
        ...

    def ping(self) -> bool: ...


class NoopReranker:
    kind = "none"

    def score(self, query: str, passages: list[str]) -> list[float]:
        # Strictly decreasing, so sorting by score keeps the order the caller already had.
        n = len(passages)
        return [1.0 - i / max(n, 1) for i in range(n)]

    def ping(self) -> bool:
        return True


class BgeReranker:
    kind = "bge"

    def __init__(self, model: object, batch_size: int = 16) -> None:
        self._model = model
        self.batch_size = batch_size

    @classmethod
    def load(cls, settings: Settings) -> "BgeReranker":
        def factory(path: object, device: str) -> object:
            from sentence_transformers import CrossEncoder

            half = device in ("mps", "cuda")
            return CrossEncoder(
                str(path),
                device=device,
                max_length=MAX_LENGTH,
                model_kwargs={"torch_dtype": "float16"} if half else None,
            )

        return cls(hf.load_cached(settings, settings.rerank_model, "reranker", factory))

    def score(self, query: str, passages: list[str]) -> list[float]:
        if not passages:
            return []
        raw = self._model.predict(  # type: ignore[attr-defined]
            [(query, p) for p in passages], batch_size=self.batch_size, show_progress_bar=False
        )
        # CrossEncoder's own Sigmoid head already maps the logit to 0-1.
        return [float(v) for v in raw]

    def ping(self) -> bool:
        return True


def get_reranker(settings: Settings) -> Reranker:
    if settings.reranker == "none":
        return NoopReranker()
    return BgeReranker.load(settings)
