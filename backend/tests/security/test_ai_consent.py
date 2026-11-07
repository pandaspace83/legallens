"""AS-3.5: with Claude on, nothing is sent to it until this lawyer has agreed to "Where your data goes"."""

import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from legallens.db.engine import Database
from legallens.db.models import AuditLog
from legallens.services import ai_consent
from tests.conftest import make_settings, signed_in_client

GATED: list[tuple[str, str, dict[str, Any]]] = [
    ("POST", "/api/v1/conversations/conv_x/messages", {"content": "hello"}),
    ("POST", "/api/v1/documents/doc_x/summaries", {"template": "opinion"}),
    ("POST", "/api/v1/drafts/drf_x/sections/s1/regenerate", {"instruction": "shorter"}),
    ("POST", "/api/v1/drafts/drf_x/sections/s1/propose", {"instruction": "shorter"}),
    ("POST", "/api/v1/drafts/drf_x/claims/c1/propose", {}),
]


def make_client(tmp_path: Path, template_db: Path, provider: str) -> TestClient:
    extra = {"anthropic_api_key": "sk-ant-test-not-real"} if provider == "claude" else {}
    settings = make_settings(tmp_path / "data", llm_provider=provider, **extra)
    settings.ensure_dirs()
    shutil.copy(template_db, settings.db_path)
    return signed_in_client(settings)


@pytest.fixture
def claude(tmp_path: Path, template_db: Path) -> Iterator[TestClient]:
    client = make_client(tmp_path, template_db, "claude")
    try:
        yield client
    finally:
        client.__exit__(None, None, None)


def call(client: TestClient, method: str, path: str, body: dict[str, Any]) -> Any:
    return client.request(method, path, json=body, headers={"Idempotency-Key": "k-1"})


def test_a_new_account_is_asked_before_claude_is_used(claude: TestClient) -> None:
    state = claude.get("/api/v1/auth/me").json()["ai_consent"]
    assert state == {"required": True, "version": ai_consent.CURRENT_VERSION, "given_at": None}


@pytest.mark.parametrize(("method", "path", "body"), GATED)
def test_every_route_that_reaches_claude_refuses_until_agreed(
    claude: TestClient, method: str, path: str, body: dict[str, Any]
) -> None:
    refused = call(claude, method, path, body)
    assert refused.status_code == 403 and refused.json()["code"] == "ai_consent_required"
    assert claude.post("/api/v1/auth/ai-consent", json={"version": ai_consent.CURRENT_VERSION}).status_code == 200
    # Past the gate, the unknown id is the only thing left to refuse.
    assert call(claude, method, path, body).status_code == 404


def test_agreeing_is_recorded_and_audited(claude: TestClient) -> None:
    response = claude.post("/api/v1/auth/ai-consent", json={"version": ai_consent.CURRENT_VERSION})
    assert response.status_code == 200
    state = response.json()["ai_consent"]
    assert state["required"] is False and state["given_at"]
    assert claude.get("/api/v1/auth/me").json()["ai_consent"]["required"] is False
    database = Database(claude.app.state.settings.db_path)  # type: ignore[attr-defined]
    with database.read() as db:
        events = [e for e in db.query(AuditLog).all() if e.action == "ai_consent_given"]
    database.dispose()
    assert len(events) == 1 and events[0].details_json == {"version": ai_consent.CURRENT_VERSION, "provider": "claude"}


def test_agreeing_to_old_wording_is_refused(claude: TestClient) -> None:
    response = claude.post("/api/v1/auth/ai-consent", json={"version": "0"})
    assert response.status_code == 409 and response.json()["code"] == "consent_version_changed"
    assert claude.get("/api/v1/auth/me").json()["ai_consent"]["required"] is True


def test_reading_and_uploading_are_not_blocked(claude: TestClient) -> None:
    assert claude.get("/api/v1/matters").status_code == 200


def test_local_mode_asks_nothing(tmp_path: Path, template_db: Path) -> None:
    client = make_client(tmp_path, template_db, "local")
    try:
        assert client.get("/api/v1/auth/me").json()["ai_consent"]["required"] is False
        for method, path, body in GATED:
            assert call(client, method, path, body).status_code == 404
    finally:
        client.__exit__(None, None, None)
