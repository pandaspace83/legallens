"""Shared helpers for the local Hugging Face models (embedder and reranker).

Models live under <data_dir>/models/hf, outside any synced folder. Loading is offline once the files are
there (DEC-08); `legallens models download` is the only step that touches the network.
"""

import os
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any, TypeVar

from legallens.config import Settings

T = TypeVar("T")

_lock = threading.Lock()
_cache: dict[tuple[str, str, str], Any] = {}


def resolve_device(setting: str) -> str:
    if setting != "auto":
        return setting
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def model_dir(settings: Settings, name: str) -> Path:
    return settings.models_path / name.replace("/", "--")


IGNORED = ["onnx/*", "*.onnx", "*.onnx_data", "imgs/*", "assets/*", "*.png", "*.jpg", "*.jpeg"]


def is_downloaded(settings: Settings, name: str) -> bool:
    path = model_dir(settings, name)
    return path.is_dir() and any(path.iterdir())


def download(settings: Settings, name: str) -> Path:
    """Fetch a model's files into the models folder. The only network call in the model layer."""
    from huggingface_hub import snapshot_download

    target = model_dir(settings, name)
    target.mkdir(parents=True, exist_ok=True)
    # sentence-transformers needs the PyTorch weights and tokenizer only; the ONNX copy of bge-m3 (2.3 GB) and the
    # README images are never read.
    snapshot_download(repo_id=name, local_dir=target, ignore_patterns=IGNORED)
    return target


def load_cached(settings: Settings, name: str, kind: str, factory: Callable[[Path, str], T]) -> T:
    """Load a model once per process. Ingestion asks for an embedder per document, so this must be cheap."""
    device = resolve_device(settings.model_device)
    key = (kind, name, device)
    with _lock:
        if key not in _cache:
            path = model_dir(settings, name)
            if not is_downloaded(settings, name):
                raise FileNotFoundError(
                    f"Model {name} is not downloaded. Run `legallens models download` first (expected in {path})."
                )
            os.environ.setdefault("HF_HUB_OFFLINE", "1")
            _cache[key] = factory(path, device)
        loaded: T = _cache[key]
        return loaded


def clear_cache() -> None:
    with _lock:
        _cache.clear()
