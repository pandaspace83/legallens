"""Matter events carry what the screens need without extra calls (INT-1.2): a stable step code and a detail line
on job.progress, the summary or draft being made, its name or title on job.done, and the file name on document
events, with quarantine marked."""

from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select

from legallens.db.models import MatterEvent
from legallens.db.scope import set_scope
from legallens.ingestion.scanner import ScanResult
from tests.conftest import Api


def _events(api: Api, matter_id: str, event_type: str | None = None) -> list[dict[str, Any]]:
    with api.database.read() as db:
        set_scope(db, matter_id)
        rows = db.execute(select(MatterEvent).where(MatterEvent.matter_id == matter_id).order_by(MatterEvent.id))
        return [{"type": e.type, **e.data_json} for e in rows.scalars() if event_type in (None, e.type)]


def _codes(events: list[dict[str, Any]], kind: str) -> list[str]:
    codes: list[str] = []
    for e in events:
        if e["type"] == "job.progress" and e["kind"] == kind and (not codes or codes[-1] != e["step_code"]):
            codes.append(e["step_code"])
    return codes


def test_ingest_steps_and_document_names(api: Api) -> None:
    matter = api.create_matter()
    msa, letter = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
    events = _events(api, matter["id"])
    progress = [e for e in events if e["type"] == "job.progress"]
    assert all(e["step_code"] in {"checking", "reading", "ocr", "indexing"} for e in progress)
    assert all(e["detail"] == e["step"] and e["detail"] for e in progress)
    scanned = [e for e in progress if e["document_id"] == letter]
    assert "ocr" in _codes(scanned, "ingest")  # the scanned letter goes through OCR
    assert _codes([e for e in progress if e["document_id"] == msa], "ingest")[0] == "checking"
    ready = {e["document_id"]: e["name"] for e in events if e["type"] == "document.ready"}
    assert ready == {msa: "smith_msa_v3.pdf", letter: "acme_demand_letter_scanned.pdf"}


def test_summary_and_draft_jobs_name_what_they_make(api: Api) -> None:
    matter = api.create_matter()
    (letter,) = api.ingest(matter["id"], "acme_demand_letter_scanned.pdf")
    summary = api.client.post(
        f"/api/v1/documents/{letter}/summaries", json={"template": "letter_demand", "audience": "detailed"}
    ).json()
    chat = api.new_chat(matter["id"])
    turn = api.ask(chat, "Draft a response letter", mode="draft", options={"incoming_document_id": letter})
    draft_id = turn.first("job")["entity_id"]
    api.run_jobs()

    events = _events(api, matter["id"])
    assert _codes(events, "summarize") == ["reading", "extracting", "writing", "verifying"]
    assert _codes(events, "draft") == ["reading", "claims", "retrieving", "drafting", "safeguards", "verifying"]
    assert all(e["summary_id"] == summary["summary_id"] for e in events if e.get("kind") == "summarize")
    assert all(e["draft_id"] == draft_id for e in events if e.get("kind") == "draft")

    done = {e["kind"]: e for e in events if e["type"] == "job.done"}
    assert done["summarize"]["entity_id"] == done["summarize"]["summary_id"] == summary["summary_id"]
    assert done["summarize"]["document_name"] == "acme_demand_letter_scanned.pdf"
    draft = api.client.get(f"/api/v1/drafts/{draft_id}").json()
    assert done["draft"]["entity_id"] == done["draft"]["draft_id"] == draft_id
    assert done["draft"]["title"] == draft["title"] and draft["title"]


def test_quarantined_upload_is_announced(api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
    class Infected:
        kind = "clamd"

        def scan(self, path: Path) -> ScanResult:
            return ScanResult("infected", "Eicar-Test-Signature")

    monkeypatch.setattr("legallens.api.v1.documents.get_scanner", lambda settings: Infected())
    matter = api.create_matter()
    response = api.upload(matter["id"], "rivera_lease.txt")
    assert response.status_code == 422
    (failed,) = _events(api, matter["id"], "document.failed")
    assert failed["document_id"] == response.json()["document_id"]
    assert (failed["name"], failed["quarantined"]) == ("rivera_lease.txt", True)
