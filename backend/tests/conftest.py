"""Shared fixtures. Each test gets its own data folder and database (copied from a template migrated once), the
fast converter, no malware scanner and no streaming delay. Slow tests (Docling, ClamAV) are marked `slow`."""

import json
import shutil
import threading
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
import uvicorn
from fastapi.testclient import TestClient

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.migrate import upgrade
from legallens.jobs.worker import run_pending
from legallens.main import create_app
from legallens.samples.generate import ORIGINS, write_sample
from legallens.samples.seed import ensure_user

EMBED_DIM = 64


@pytest.fixture(scope="session")
def template_db(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("template") / "legallens.db"
    upgrade(path, embed_dim=EMBED_DIM)
    Database(path).dispose()
    return path


@pytest.fixture(scope="session")
def samples_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    folder = tmp_path_factory.mktemp("samples")
    for name in ORIGINS:
        write_sample(name, folder)
    return folder


def make_settings(data_dir: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "test",
        "data_dir": data_dir,
        "scanner": "none",
        "converter": "fast",
        "embed_dim": EMBED_DIM,
        "embedder": "hash",
        "reranker": "none",
        "orchestrator": "stub",
        "stub_token_delay_ms": 0,
        "events_poll_seconds": 0.05,
        "sse_ping_seconds": 15,
        "inprocess_worker": False,
    }
    values.update(overrides)
    return Settings(**values)


@pytest.fixture
def settings(tmp_path: Path, template_db: Path) -> Settings:
    s = make_settings(tmp_path / "data")
    s.ensure_dirs()
    shutil.copy(template_db, s.db_path)
    return s


@dataclass
class Api:
    """A signed-in TestClient plus helpers for the common multi-step flows."""

    client: TestClient
    settings: Settings
    samples: Path

    @property
    def app(self) -> Any:
        return self.client.app

    @property
    def database(self) -> Database:
        return self.client.app.state.database  # type: ignore[attr-defined,no-any-return]

    def create_matter(self, name: str = "Smith v. Acme Corp", **extra: Any) -> dict[str, Any]:
        body = {"name": name, "client_name": "Smith Logistics LLC", "our_side": "defendant", **extra}
        response = self.client.post("/api/v1/matters", json=body)
        assert response.status_code == 201, response.text
        return response.json()  # type: ignore[no-any-return]

    def upload(self, matter_id: str, name: str, origin: str | None = None, data: bytes | None = None) -> Any:
        content = data if data is not None else (self.samples / name).read_bytes()
        return self.client.post(
            f"/api/v1/matters/{matter_id}/documents",
            files={"file": (name, content)},
            data={"origin": origin or ORIGINS.get(name, "client")},
        )

    def run_jobs(self) -> int:
        return run_pending(self.database, self.settings)

    def ingest(self, matter_id: str, *names: str) -> list[str]:
        ids = []
        for name in names:
            response = self.upload(matter_id, name)
            assert response.status_code == 202, response.text
            ids.append(response.json()["document_id"])
        self.run_jobs()
        return ids

    def new_chat(self, matter_id: str) -> str:
        response = self.client.post(f"/api/v1/matters/{matter_id}/conversations", json={})
        assert response.status_code == 201, response.text
        return response.json()["id"]  # type: ignore[no-any-return]

    def resolve_draft(self, draft_id: str) -> dict[str, Any]:
        """Fills every placeholder and acknowledges every citation, as a lawyer would before adopting a draft.
        [UNVERIFIED: …] stays: acknowledging its checklist row is the lawyer's vouching for it."""
        url = f"/api/v1/drafts/{draft_id}"
        draft = self.client.get(url).json()
        edits = []
        for section in draft["sections"]:
            content = section["content"]
            for p in [p for p in draft["placeholders"] if p["section_id"] == section["id"]]:
                if p["kind"] != "unverified":
                    content = content.replace(p["token"], "Smith disputes this point.")
            if content != section["content"]:
                edits.append({"id": section["id"], "content": content})
        version = draft["version"]
        if edits:
            response = self.client.patch(url, json={"base_version": version, "sections": edits})
            assert response.status_code == 200, response.text
            version = response.json()["version"]
        items = [i["id"] for i in self.client.get(f"{url}/checks").json()["citation_checklist"]]
        if items:
            response = self.client.patch(url, json={"base_version": version, "acknowledge": items})
            assert response.status_code == 200, response.text
        return self.client.get(url).json()  # type: ignore[no-any-return]

    def ask(self, conversation_id: str, content: str, **body: Any) -> "Turn":
        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            json={"content": content, **body},
            headers={"Idempotency-Key": uuid.uuid4().hex},
        )
        assert response.status_code == 202, response.text
        accepted = response.json()
        events = read_sse(self.client, accepted["stream_url"])
        messages = self.client.get(f"/api/v1/conversations/{conversation_id}/messages").json()["items"]
        return Turn(accepted, events, messages[-1])


@dataclass
class Turn:
    accepted: dict[str, Any]
    events: list[tuple[str, dict[str, Any], str | None]]
    answer: dict[str, Any]

    @property
    def names(self) -> list[str]:
        return [name for name, _, _ in self.events]

    def first(self, name: str) -> dict[str, Any]:
        return next(data for n, data, _ in self.events if n == name)

    def all(self, name: str) -> list[dict[str, Any]]:
        return [data for n, data, _ in self.events if n == name]


def parse_sse(body: str) -> list[tuple[str, dict[str, Any], str | None]]:
    events, name, data, event_id = [], None, None, None
    for line in body.splitlines():
        if line.startswith("event: "):
            name = line[7:]
        elif line.startswith("data: "):
            data = json.loads(line[6:])
        elif line.startswith("id: "):
            event_id = line[4:]
        elif line == "" and name is not None:
            events.append((name, data or {}, event_id))
            name, data, event_id = None, None, None
    if name is not None:
        events.append((name, data or {}, event_id))
    return events


def read_sse(client: TestClient, url: str, headers: dict[str, str] | None = None) -> list[tuple[str, Any, str | None]]:
    with client.stream("GET", url, headers=headers or {}) as response:
        assert response.status_code == 200, response.read()
        return parse_sse("".join(response.iter_text()))


def signed_in_client(settings: Settings, email: str | None = None) -> TestClient:
    app = create_app(settings)
    client = TestClient(app)
    client.__enter__()
    user = ensure_user(app.state.database, settings) if email is None else None
    if email is not None:
        _make_user(app.state.database, email)
    response = client.post("/api/v1/auth/dev-session", json={"email": email or user.email})  # type: ignore[union-attr]
    assert response.status_code == 200, response.text
    return client


def _make_user(database: Database, email: str) -> None:
    from sqlalchemy import select

    from legallens.db.models import User
    from legallens.ids import new_id

    with database.write() as db:
        if db.execute(select(User).where(User.email == email)).scalar_one_or_none() is None:
            db.add(User(id=new_id("user"), email=email, name=email.split("@")[0], licensing_states=[]))


@pytest.fixture
def api(settings: Settings, samples_dir: Path) -> Iterator[Api]:
    client = signed_in_client(settings)
    try:
        yield Api(client, settings, samples_dir)
    finally:
        client.__exit__(None, None, None)


@pytest.fixture
def other_api(api: Api) -> Iterator[Api]:
    """A second lawyer signed in to the same app (only possible if LegalLens ever has several users)."""
    client = TestClient(api.client.app)
    client.__enter__()
    _make_user(api.database, "other@legallens.local")
    response = client.post("/api/v1/auth/dev-session", json={"email": "other@legallens.local"})
    assert response.status_code == 200
    try:
        yield Api(client, api.settings, api.samples)
    finally:
        client.__exit__(None, None, None)


@dataclass
class LiveServer:
    url: str
    settings: Settings


@pytest.fixture
def live_server(settings: Settings) -> Iterator[LiveServer]:
    """A real uvicorn server on 127.0.0.1, for endless SSE streams that TestClient can't read incrementally."""
    import socket

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ensure_user(Database(settings.db_path), settings)
    server = uvicorn.Server(
        uvicorn.Config(create_app(settings), host="127.0.0.1", port=port, log_config=None, access_log=False)
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    try:
        yield LiveServer(f"http://127.0.0.1:{port}", settings)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
