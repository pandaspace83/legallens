"""Nothing leaves the machine and nothing leaks into logs (DEC-56, DEC-68, RISK-12); every write is audited."""

import json
import logging
import socket
from collections.abc import Iterator

import pytest
from sqlalchemy import text

from tests.conftest import Api

CANARY = "ZEBRA-CANARY-7f3a9c"


@pytest.fixture
def captured_logs() -> Iterator[list[str]]:
    """Every log record, formatted by the app's JSON formatter, from every logger."""
    from legallens.logging import JsonFormatter

    lines: list[str] = []

    class Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(JsonFormatter().format(record))

    handler = Collect(level=logging.DEBUG)
    root = logging.getLogger()
    previous = root.level
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    try:
        yield lines
    finally:
        root.removeHandler(handler)
        root.setLevel(previous)


def test_client_text_never_reaches_the_logs(api: Api, captured_logs: list[str]) -> None:
    matter = api.create_matter(f"Matter {CANARY}", client_name=f"Client {CANARY}")
    document = f"CONFIDENTIAL MEMO\n\n1.1 The settlement password is {CANARY} and must stay private."
    upload = api.upload(matter["id"], f"{CANARY}.txt", "client", document.encode())
    assert upload.status_code == 202
    api.run_jobs()
    chat = api.new_chat(matter["id"])
    turn = api.ask(chat, f"What is the settlement password {CANARY}?")
    assert CANARY in turn.answer["content"]  # it is in the answer...
    api.client.get(f"/api/v1/matters/{matter['id']}/conversations", params={"q": CANARY})
    api.client.post(
        f"/api/v1/matters/{matter['id']}/documents",
        files={"file": ("x.bin", b"\x00\x01" * 10)},
        data={"origin": "client"},
    )
    api.client.delete(f"/api/v1/matters/{matter['id']}", params={"confirm": CANARY})
    assert captured_logs, "the scenario should have logged something"
    leaked = [line for line in captured_logs if CANARY in line]
    assert leaked == []  # ...and in no log line


def test_no_outbound_connections_during_ingestion_and_chat(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    attempts: list[object] = []
    original = socket.socket.connect

    def guarded(self: socket.socket, address: object) -> object:
        local = isinstance(address, str) or (
            isinstance(address, tuple) and str(address[0]) in ("127.0.0.1", "::1", "localhost")
        )
        if not local:
            attempts.append(address)
            raise OSError("outbound connection blocked by test")
        return original(self, address)  # type: ignore[arg-type]

    monkeypatch.setattr(socket.socket, "connect", guarded)
    matter = api.create_matter()
    api.ingest(
        matter["id"],
        "smith_msa_v3.pdf",
        "acme_demand_letter_scanned.pdf",
        "acme_redline_other_side.docx",
        "email_from_acme_counsel.eml",
    )
    api.run_jobs()
    chat = api.new_chat(matter["id"])
    api.ask(chat, "What notice is needed to terminate?")
    api.ask(chat, "Summarize the acme_demand_letter_scanned", mode="summarize")
    api.run_jobs()
    assert attempts == []


def test_every_write_is_audited(api: Api, samples_dir) -> None:  # type: ignore[no-untyped-def]
    def actions() -> list[str]:
        with api.database.read() as db:
            return [r[0] for r in db.execute(text("SELECT action FROM audit_log ORDER BY id"))]

    def did(expected: str, call) -> None:  # type: ignore[no-untyped-def]
        before = len(actions())
        response = call()
        assert response.status_code < 400, response.text
        new = actions()[before:]
        assert new == [expected], (expected, new)

    matter = api.create_matter()
    mid = matter["id"]
    did("matter_update", lambda: api.client.patch(f"/api/v1/matters/{mid}", json={"practice_area": "x"}))
    did("upload", lambda: api.upload(mid, "acme_demand_letter_scanned.pdf"))
    api.run_jobs()
    doc = api.client.get(f"/api/v1/matters/{mid}/documents").json()["items"][0]["id"]
    chat = api.new_chat(mid)
    did(
        "ask",
        lambda: api.client.post(
            f"/api/v1/conversations/{chat}/messages", json={"content": "Demands?"}, headers={"Idempotency-Key": "a1"}
        ),
    )
    answer = None
    for _ in range(50):
        items = api.client.get(f"/api/v1/conversations/{chat}/messages").json()["items"]
        if items[-1]["status"] != "streaming":
            answer = items[-1]
            break
        import time

        time.sleep(0.05)
    assert answer is not None
    did("feedback", lambda: api.client.post(f"/api/v1/messages/{answer['id']}/feedback", json={"kind": "helpful"}))
    did("view_hidden_content", lambda: api.client.get(f"/api/v1/documents/{doc}/hidden-content"))
    did("generate", lambda: api.client.post(f"/api/v1/documents/{doc}/summaries", json={"template": "letter_demand"}))
    turn = api.ask(chat, "Draft a response", mode="draft", options={"incoming_document_id": doc})
    api.run_jobs()
    draft_id = turn.first("job")["entity_id"]
    did(
        "edit",
        lambda: api.client.patch(
            f"/api/v1/drafts/{draft_id}", json={"base_version": 1, "safeguards": {"fre408_header": True}}
        ),
    )
    did(
        "generate",
        lambda: api.client.post(f"/api/v1/drafts/{draft_id}/sections/s3/regenerate", json={"instruction": "shorter"}),
    )
    api.run_jobs()
    version = api.client.get(f"/api/v1/drafts/{draft_id}").json()["version"]
    preview: dict = {}  # type: ignore[type-arg]

    def propose() -> object:
        response = api.client.post(f"/api/v1/drafts/{draft_id}/sections/s3/propose", json={"instruction": "firmer"})
        preview.update(response.json())
        return response

    did("generate", propose)
    did(
        "edit",
        lambda: api.client.patch(
            f"/api/v1/drafts/{draft_id}", json={"base_version": version, "accept_proposal": preview["proposal_id"]}
        ),
    )
    claim = api.client.get(f"/api/v1/drafts/{draft_id}").json()["claims"][0]["id"]
    did("generate", lambda: api.client.post(f"/api/v1/drafts/{draft_id}/claims/{claim}/propose"))
    did(
        "generate",
        lambda: api.client.post(
            f"/api/v1/matters/{mid}/drafts", json={"type": "memo", "incoming_document_id": doc, "instructions": "x"}
        ),
    )
    api.resolve_draft(draft_id)
    did("review", lambda: api.client.post(f"/api/v1/drafts/{draft_id}/review", json={"confirm": True}))
    did("export", lambda: api.client.post(f"/api/v1/drafts/{draft_id}/export", params={"kind": "working"}))
    did("export", lambda: api.client.post(f"/api/v1/matters/{mid}/export"))
    did("delete", lambda: api.client.delete(f"/api/v1/conversations/{chat}"))
    did("delete", lambda: api.client.delete(f"/api/v1/documents/{doc}"))
    did("matter_close", lambda: api.client.post(f"/api/v1/matters/{mid}/close"))
    did("delete", lambda: api.client.delete(f"/api/v1/matters/{mid}", params={"confirm": matter["name"]}))
    did("logout", lambda: api.client.post("/api/v1/auth/logout"))

    with api.database.read() as db:
        details = [json.loads(r[0]) for r in db.execute(text("SELECT details_json FROM audit_log"))]
        from legallens.services.audit import verify_chain

        assert verify_chain(db) == (True, None)
    assert all(isinstance(d, dict) for d in details)
