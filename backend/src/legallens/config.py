"""Settings, read from LEGALLENS_* environment variables (and an optional .env file)."""

import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def default_data_dir() -> Path:
    """The OS app-data folder. Never the project folder: a Desktop or Documents folder may sync to a cloud
    drive, and the database and uploaded files must stay on this machine (DEC-08)."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "LegalLens"
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "LegalLens"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "legallens"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LEGALLENS_", env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    data_dir: Path = Field(default_factory=default_data_dir)
    host: str = "127.0.0.1"
    port: int = 8000

    # Sign-in. "dev" accepts any password and any 6-digit code but keeps the real two-step contract.
    auth_mode: Literal["dev", "real"] = "dev"
    lockout_attempts: int = 5  # wrong passwords or codes before the account locks
    lockout_minutes: int = 15
    dev_user_email: str = "lawyer@legallens.local"
    dev_user_name: str = "Dev Lawyer"
    session_idle_minutes: int = 30
    session_max_hours: int = 12
    cookie_secure: bool = False

    # The built frontend (`npm run build:app` in frontend/), served from the same origin as the API (INT-5.1).
    # Defaults to <repo>/frontend/dist when that folder exists; the API alone runs without it.
    frontend_dir: Path | None = None

    # Uploads
    scanner: Literal["clamd", "none"] = "clamd"
    clamd_socket: Path = Path("/opt/homebrew/var/run/clamav/clamd.sock")
    max_upload_mb: int = 50
    max_pages: int = 300

    # Ingestion
    converter: Literal["docling", "fast"] = "docling"
    docling_artifacts: Path | None = None  # defaults to <data_dir>/models/docling
    ocr_lang: str = "eng"
    ocr_low_confidence: float = 0.80

    # Models
    embedder: Literal["hash", "ollama", "bge-m3"] = "bge-m3"
    embed_dim: int = 1024
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_embed_model: str = "bge-m3"
    embed_model: str = "BAAI/bge-m3"
    reranker: Literal["bge", "none"] = "bge"
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    models_dir: Path | None = None  # defaults to <data_dir>/models/hf
    model_device: Literal["auto", "mps", "cuda", "cpu"] = "auto"

    # Retrieval sizes: candidates per search leg, after fusion, and passages kept after the rerank.
    k_per_leg: int = 25
    k_fused: int = 50
    rerank_top_n: int = 8
    # The "Not found" gate when the reranker is on (GATE_BENCHMARK.md): pass at this top score, or at the lower
    # one when the keyword share is also high (a terse passage such as an address can score low).
    gate_rerank_min: float = 0.30
    gate_rescue_rerank: float = 0.05
    gate_rescue_keyword: float = 0.60

    # Orchestration
    # "local": rewrite, answer, summary and draft by the local models. "stub" is the deterministic stand-in for
    # tests and for a machine without Ollama; the top bar says "Stand-in answers" while it is on.
    orchestrator: Literal["stub", "local"] = "local"
    # The local LLM (Ollama, this machine only: DEC-08). One model per job; the names are settings so a bigger
    # model can be swapped in without code changes. Chosen by comparison in WORKFLOWS_TODO Phase 2.
    llm_url: str = "http://127.0.0.1:11434"
    llm_rewrite_model: str = "llama3.2:3b"
    # Ask uses the 7B: it scored the same as the 14B on the golden set (23/24) at a third of the time (DEC-90).
    llm_answer_model: str = "qwen2.5:7b-instruct"
    llm_summary_model: str = "qwen2.5:14b-instruct"
    # DEC-14: a 50-page summary in 5 minutes. The 14B needed 10 minutes on this Mac, so long documents use the 7B.
    llm_summary_long_model: str = "qwen2.5:7b-instruct"
    summary_long_pages: int = 20
    llm_draft_model: str = "qwen2.5:14b-instruct"
    llm_context_tokens: int = 8192
    llm_timeout_seconds: int = 300
    llm_retries: int = 1
    llm_history_turns: int = 6
    llm_history_chars: int = 1500
    stub_token_delay_ms: int = 25

    # Streaming and jobs
    sse_ping_seconds: int = 15
    run_buffer_ttl_seconds: int = 600
    events_poll_seconds: float = 0.5
    worker_poll_seconds: float = 0.5
    inprocess_worker: bool = False
    job_max_attempts: int = 3
    job_stale_seconds: int = 120

    @property
    def frontend_path(self) -> Path | None:
        folder = self.frontend_dir or Path(__file__).resolve().parents[3] / "frontend" / "dist"
        return folder if (folder / "index.html").is_file() else None

    @property
    def db_path(self) -> Path:
        return self.data_dir / "legallens.db"

    @property
    def files_dir(self) -> Path:
        return self.data_dir / "files"

    @property
    def quarantine_dir(self) -> Path:
        return self.data_dir / "quarantine"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    @property
    def worker_heartbeat_path(self) -> Path:
        return self.data_dir / "worker.heartbeat"

    @property
    def docling_artifacts_path(self) -> Path:
        return self.docling_artifacts or (self.data_dir / "models" / "docling")

    @property
    def error_log_dir(self) -> Path:
        return self.data_dir / "logs" / "errors"

    @property
    def models_path(self) -> Path:
        return self.models_dir or (self.data_dir / "models" / "hf")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.files_dir, self.quarantine_dir, self.exports_dir, self.tmp_dir):
            path.mkdir(parents=True, exist_ok=True)
        if os.name == "posix":
            self.data_dir.chmod(0o700)  # client data: owner only


@lru_cache
def get_settings() -> Settings:
    return Settings()
