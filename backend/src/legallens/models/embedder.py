"""Embedding models behind one interface (DEC-18).

HashEmbedder is the default until the Slice 0 benchmark picks a real model (DEF-01). It is deterministic and
needs no model: feature hashing of word stems and word pairs into a fixed-size unit vector. Its similarity is
lexical, not semantic, which is enough to exercise the dense search leg end to end.

OllamaEmbedder calls a local Ollama server (127.0.0.1 only) when LEGALLENS_EMBEDDER=ollama.
"""

import hashlib
import itertools
import math
import re
import struct
from typing import Any, Protocol

import httpx

from legallens.config import Settings
from legallens.models import hf

_WORD = re.compile(r"[a-z0-9]+")


class Embedder(Protocol):
    kind: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...
    def ping(self) -> bool: ...


def _stem(word: str) -> str:
    for suffix in ("ations", "ation", "ings", "ing", "ies", "ied", "es", "ed", "ly", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


class HashEmbedder:
    kind = "hash"

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def _bucket(self, feature: str) -> tuple[int, float]:
        digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
        value = int.from_bytes(digest, "little")
        return value % self.dim, (1.0 if (value >> 63) & 1 else -1.0)

    def embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        words = [_stem(w) for w in _WORD.findall(text.lower())]
        features = words + [f"{a}_{b}" for a, b in itertools.pairwise(words)]
        for feature in features:
            index, sign = self._bucket(feature)
            vec[index] += sign
        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0:
            vec[0] = 1.0
            return vec
        return [v / norm for v in vec]

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_one(t) for t in texts]

    def ping(self) -> bool:
        return True


class OllamaEmbedder:
    kind = "ollama"

    def __init__(self, url: str, model: str, dim: int) -> None:
        if not url.startswith(("http://127.0.0.1", "http://localhost")):
            raise ValueError("Ollama must run on this machine (DEC-08).")
        self.url = url.rstrip("/")
        self.model = model
        self.model_name = model
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        response = httpx.post(f"{self.url}/api/embed", json={"model": self.model, "input": texts}, timeout=120)
        response.raise_for_status()
        vectors: list[list[float]] = response.json()["embeddings"]
        if vectors and len(vectors[0]) != self.dim:
            raise ValueError(f"Model returns {len(vectors[0])} dimensions; the index expects {self.dim}.")
        return vectors

    def ping(self) -> bool:
        try:
            return httpx.get(f"{self.url}/api/tags", timeout=2).status_code == 200
        except httpx.HTTPError:
            return False


class BgeM3Embedder:
    """BAAI/bge-m3 in-process: 1024 dimensions, up to 8,192 tokens, no query prefix, L2-normalised."""

    kind = "bge-m3"

    def __init__(self, model: Any, dim: int, batch_size: int = 16, model_name: str = "BAAI/bge-m3") -> None:
        self._model = model
        self.dim = dim
        self.model_name = model_name
        self.batch_size = batch_size

    @classmethod
    def load(cls, settings: Settings) -> "BgeM3Embedder":
        def factory(path: Any, device: str) -> Any:
            from sentence_transformers import SentenceTransformer

            half = device in ("mps", "cuda")
            return SentenceTransformer(
                str(path), device=device, model_kwargs={"torch_dtype": "float16"} if half else None
            )

        model = hf.load_cached(settings, settings.embed_model, "embedder", factory)
        actual = (getattr(model, "get_embedding_dimension", None) or model.get_sentence_embedding_dimension)()
        if actual != settings.embed_dim:
            raise ValueError(
                f"{settings.embed_model} returns {actual} dimensions; the index expects {settings.embed_dim}."
            )
        return cls(model, settings.embed_dim, model_name=settings.embed_model)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._model.encode(
            texts, batch_size=self.batch_size, normalize_embeddings=True, show_progress_bar=False
        )
        return [[float(x) for x in row] for row in vectors]

    def ping(self) -> bool:
        return True


def get_embedder(settings: Settings) -> Embedder:
    if settings.embedder == "bge-m3":
        return BgeM3Embedder.load(settings)
    if settings.embedder == "ollama":
        return OllamaEmbedder(settings.ollama_url, settings.ollama_embed_model, settings.embed_dim)
    return HashEmbedder(settings.embed_dim)


def to_blob(vector: list[float]) -> bytes:
    """sqlite-vec reads float32 little-endian blobs."""
    return struct.pack(f"<{len(vector)}f", *vector)
