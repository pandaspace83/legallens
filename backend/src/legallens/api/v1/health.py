"""Ops · GET /health. No sign-in needed, and it returns no client data."""

import importlib.util
import shutil
import time

from fastapi import APIRouter
from sqlalchemy import select, text

from legallens import __version__
from legallens.api.deps import AppDatabase, AppSettings
from legallens.config import Settings
from legallens.db.models import Matter
from legallens.db.scope import unscoped
from legallens.ingestion.scanner import get_scanner
from legallens.models import hf
from legallens.models.embedder import get_embedder
from legallens.models.llm import local_status
from legallens.schemas.audit import ComponentHealth, HealthOut
from legallens.search import index_guard

router = APIRouter(tags=["Ops"])


@router.get("/health", operation_id="getHealth")
def health(database: AppDatabase, settings: AppSettings) -> HealthOut:
    try:
        with database.read() as db:
            db.execute(text("SELECT 1"))
            vec_version = db.execute(text("SELECT vec_version()")).scalar()
            db.execute(text("SELECT rowid FROM chunks_fts LIMIT 0"))
        db_ok = ComponentHealth(kind="sqlite", ok=True, detail=str(database.path.name))
        vec_ok = ComponentHealth(kind="sqlite-vec", ok=True, detail=str(vec_version))
        fts_ok = ComponentHealth(kind="fts5", ok=True)
    except Exception as exc:
        db_ok = ComponentHealth(kind="sqlite", ok=False, detail=type(exc).__name__)
        vec_ok = ComponentHealth(kind="sqlite-vec", ok=False)
        fts_ok = ComponentHealth(kind="fts5", ok=False)

    heartbeat = settings.worker_heartbeat_path
    age = time.time() - heartbeat.stat().st_mtime if heartbeat.exists() else None
    worker_ok = age is not None and age < max(10.0, settings.worker_poll_seconds * 10)
    worker = ComponentHealth(
        kind="worker", ok=worker_ok, detail=f"last heartbeat {age:.0f}s ago" if age is not None else "not running"
    )

    scanner = get_scanner(settings)
    scanner_health = ComponentHealth(
        kind=scanner.kind, ok=scanner.ping(), detail=None if scanner.kind == "clamd" else "uploads are not scanned"
    )

    embedder_health = _embedder_health(settings)
    if embedder_health.ok:
        embedder_health = _with_index_check(database, settings, embedder_health)

    if settings.converter == "docling":
        docling_ok = importlib.util.find_spec("docling") is not None and settings.docling_artifacts_path.exists()
        converter = ComponentHealth(
            kind="docling", ok=docling_ok, detail=None if docling_ok else "Docling or its models are missing"
        )
    else:
        converter = ComponentHealth(kind="fast", ok=True, detail="PyMuPDF + python-docx + Tesseract")

    # The model and prompt versions sit in the engine's detail, so Settings > About can show them (INT-3.10).
    stub = settings.orchestrator == "stub"
    if stub:
        orchestrator = ComponentHealth(kind="stub", ok=True, detail="stub-orchestrator · prompt stub-0")
    else:
        llm_ok, llm_detail = local_status(settings)
        orchestrator = ComponentHealth(kind=settings.orchestrator, ok=llm_ok, detail=llm_detail)

    storage = _storage(settings)
    healthy = all(
        c.ok for c in (db_ok, vec_ok, fts_ok, worker, scanner_health, embedder_health, converter, orchestrator, storage)
    )
    return HealthOut(
        status="ok" if healthy else "degraded",
        version=__version__,
        db=db_ok,
        sqlite_vec=vec_ok,
        fts5=fts_ok,
        worker=worker,
        scanner=scanner_health,
        embedder=embedder_health,
        converter=converter,
        orchestrator=orchestrator,
        storage=storage,
    )


_LOW_FREE_BYTES = 2 * 1024**3
_LOW_FREE_FRACTION = 0.05


def _storage(settings: Settings) -> ComponentHealth:
    """Free space where the data lives. Low space is what the "almost full" banner reports (FE-8.3)."""
    try:
        usage = shutil.disk_usage(settings.data_dir)
    except OSError as exc:
        return ComponentHealth(kind="disk", ok=False, detail=type(exc).__name__)
    free_gb = usage.free / 1024**3
    fraction = usage.free / usage.total if usage.total else 1.0
    ok = usage.free >= _LOW_FREE_BYTES and fraction >= _LOW_FREE_FRACTION
    detail = f"{free_gb:.0f} GB free" if ok else f"{free_gb:.1f} GB free ({fraction:.0%})"
    return ComponentHealth(kind="disk", ok=ok, detail=detail)


def _embedder_health(settings: Settings) -> ComponentHealth:
    """Report on the models without loading them: loading takes seconds and about 2 GB of memory."""
    if settings.embedder != "bge-m3":
        embedder = get_embedder(settings)
        return ComponentHealth(kind=embedder.kind, ok=embedder.ping(), detail=f"{embedder.dim} dimensions")
    missing = [
        name
        for name in (settings.embed_model, settings.rerank_model if settings.reranker == "bge" else None)
        if name and not hf.is_downloaded(settings, name)
    ]
    reranker = settings.rerank_model if settings.reranker == "bge" else "no reranker"
    if missing:
        return ComponentHealth(
            kind="bge-m3", ok=False, detail=f"not downloaded: {', '.join(missing)}. Run `legallens models download`."
        )
    return ComponentHealth(kind="bge-m3", ok=True, detail=f"{settings.embed_dim} dimensions · {reranker}")


def _with_index_check(database: AppDatabase, settings: Settings, health: ComponentHealth) -> ComponentHealth:
    """Degrade when a matter's vectors were made by a different model (D7): search skips the dense leg for it."""
    try:
        with database.read() as db, unscoped(db):
            matters = list(db.execute(select(Matter.id)).scalars())
            stale = index_guard.stale_matters(db, matters, index_guard.expected_signature(settings))
    except Exception:
        return health
    if not stale:
        return health
    return ComponentHealth(
        kind=health.kind,
        ok=False,
        detail=f"{len(stale)} matter(s) need `legallens reindex`: vectors were built by another model",
    )
