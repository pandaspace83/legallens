"""E · Documents: upload checks, ingestion results, viewer pages, hidden content, files and deletion."""

from pathlib import Path

import pytest
from sqlalchemy import text

from legallens.ingestion.scanner import ScannerUnavailable, ScanResult
from legallens.samples.generate import INJECTION
from tests.conftest import Api


def _doc(api: Api, document_id: str) -> dict:  # type: ignore[type-arg]
    response = api.client.get(f"/api/v1/documents/{document_id}")
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


class TestUpload:
    def test_every_sample_format_ingests(self, api: Api) -> None:
        matter = api.create_matter()
        names = [
            "smith_msa_v3.pdf",
            "acme_demand_letter_scanned.pdf",
            "exhibit_b_invoices.pdf",
            "acme_redline_other_side.docx",
            "email_from_acme_counsel.eml",
            "rivera_lease.txt",
        ]
        ids = api.ingest(matter["id"], *names)
        api.run_jobs()  # the email's attachment is queued while the email is ingested
        docs = api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"]
        assert sorted(d["filename"] for d in docs) == sorted([*names, "settlement_terms.pdf"])
        assert {d["status"] for d in docs} == {"ready"}

        scanned = _doc(api, ids[1])
        assert scanned["coverage"]["ocr_pages"] == [1] and scanned["ocr_conf_avg"] > 0.8
        exhibit = _doc(api, ids[2])
        assert exhibit["coverage"]["text"].startswith("2 of 2 pages read; OCR on p. 2")
        msa = _doc(api, ids[0])
        assert msa["chunk_count"] >= 5 and msa["defined_term_count"] >= 3
        attachment = next(d for d in docs if d["filename"] == "settlement_terms.pdf")
        assert attachment["parent_document_id"] == ids[4] and attachment["origin"] == "other_party"

    def test_job_and_matter_events_track_ingestion(self, api: Api) -> None:
        matter = api.create_matter()
        accepted = api.upload(matter["id"], "rivera_lease.txt").json()
        assert accepted["status"] == "queued"
        assert api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()["status"] == "queued"
        api.run_jobs()
        job = api.client.get(f"/api/v1/jobs/{accepted['job_id']}").json()
        assert job["status"] == "done" and job["progress"] == 100
        assert job["result"] == {
            "kind": "document",
            "id": accepted["document_id"],
            "url": f"/api/v1/documents/{accepted['document_id']}",
        }
        with api.database.read() as db:
            types = [r[0] for r in db.execute(text("SELECT type FROM matter_events ORDER BY id"))]
        assert types[-2:] == ["document.ready", "job.done"] and "job.progress" in types

    @pytest.mark.parametrize(
        ("filename", "data", "status", "code"),
        [
            ("photo.pdf", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, 415, "unsupported_type"),
            ("empty.txt", b"", 415, "unsupported_type"),
            ("broken.pdf", b"%PDF-1.7\nnot really a pdf", 422, "unreadable_file"),
        ],
    )
    def test_rejections(self, api: Api, filename: str, data: bytes, status: int, code: str) -> None:
        matter = api.create_matter()
        response = api.upload(matter["id"], filename, "client", data)
        assert (response.status_code, response.json()["code"]) == (status, code)
        assert list(api.settings.tmp_dir.iterdir()) == []  # nothing left behind

    def test_duplicates_size_and_page_limits(self, api: Api) -> None:
        matter = api.create_matter()
        first = api.upload(matter["id"], "rivera_lease.txt").json()
        again = api.upload(matter["id"], "rivera_lease.txt")
        assert again.status_code == 409 and again.json()["existing_document_id"] == first["document_id"]

        api.settings.max_pages = 1
        response = api.upload(matter["id"], "exhibit_b_invoices.pdf")
        assert (response.status_code, response.json()["code"]) == (413, "too_many_pages")

        api.settings.max_upload_mb = 0
        response = api.upload(matter["id"], "smith_msa_v3.pdf")
        assert (response.status_code, response.json()["code"]) == (413, "file_too_large")

    def test_infected_file_is_quarantined(self, api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
        class Infected:
            kind = "clamd"

            def scan(self, path: Path) -> ScanResult:
                return ScanResult("infected", "Eicar-Test-Signature")

        monkeypatch.setattr("legallens.api.v1.documents.get_scanner", lambda settings: Infected())
        matter = api.create_matter()
        response = api.upload(matter["id"], "rivera_lease.txt")
        assert (response.status_code, response.json()["code"]) == (422, "malware_detected")
        document_id = response.json()["document_id"]
        doc = _doc(api, document_id)
        assert (doc["status"], doc["scan_status"]) == ("quarantined", "infected")
        assert api.client.get(f"/api/v1/documents/{document_id}/file").json()["code"] == "document_quarantined"
        assert any((api.settings.quarantine_dir / matter["id"]).iterdir())
        assert api.run_jobs() == 0  # never ingested

    def test_scanner_down_fails_closed(self, api: Api, monkeypatch: pytest.MonkeyPatch) -> None:
        class Down:
            kind = "clamd"

            def scan(self, path: Path) -> ScanResult:
                raise ScannerUnavailable("down")

        monkeypatch.setattr("legallens.api.v1.documents.get_scanner", lambda settings: Down())
        matter = api.create_matter()
        response = api.upload(matter["id"], "rivera_lease.txt")
        assert (response.status_code, response.json()["code"]) == (503, "scanner_unavailable")
        assert api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"] == []


class TestReading:
    def test_file_supports_range_requests(self, api: Api) -> None:
        matter = api.create_matter()
        [document_id] = api.ingest(matter["id"], "smith_msa_v3.pdf")
        full = api.client.get(f"/api/v1/documents/{document_id}/file")
        assert full.status_code == 200 and full.headers["content-type"] == "application/pdf"
        part = api.client.get(f"/api/v1/documents/{document_id}/file", headers={"Range": "bytes=0-99"})
        assert part.status_code == 206 and part.content == full.content[:100]

    def test_blocks_carry_the_pinpoint_citations_use(self, api: Api) -> None:
        """INT-1.4: the viewer highlights a cited paragraph by its ref, so it must match the citation's para_ref."""
        matter = api.create_matter()
        api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
        turn = api.ask(api.new_chat(matter["id"]), "How must a termination notice be delivered?")
        for citation in turn.answer["citations"]:
            pages = api.client.get(
                f"/api/v1/documents/{citation['document_id']}/pages", params={"from": citation["page"], "limit": 1}
            ).json()["pages"]
            blocks = [b for b in pages[0]["blocks"] if b["ref"] == citation["para_ref"]]
            assert any(" ".join(citation["quote"].split()) in " ".join(b["text"].split()) for b in blocks), citation
        letter = api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"][1]
        refs = [
            b["ref"]
            for p in api.client.get(f"/api/v1/documents/{letter['id']}/pages").json()["pages"]
            for b in p["blocks"]
        ]
        assert any(r and r.startswith("¶") for r in refs)  # letters are cited by paragraph number

    def test_pages_have_blocks_with_boxes(self, api: Api) -> None:
        matter = api.create_matter()
        [document_id] = api.ingest(matter["id"], "smith_msa_v3.pdf")
        pages = api.client.get(f"/api/v1/documents/{document_id}/pages?from=1&limit=5").json()
        assert pages["pages_total"] == 2 and len(pages["pages"]) == 2
        block = next(b for b in pages["pages"][0]["blocks"] if "sixty (60) days" in b["text"])
        assert len(block["bbox"]) == 4 and block["bbox"][0] >= 0

    def test_hidden_content_is_notice_first_then_a_deliberate_audited_step(self, api: Api) -> None:
        matter = api.create_matter()
        [document_id] = api.ingest(matter["id"], "acme_redline_other_side.docx")
        doc = _doc(api, document_id)
        assert doc["hidden_content"] == {
            "kinds": ["comments", "metadata", "tracked_changes", "white_text"],
            "count": 5,
        }
        assert "items" not in doc["hidden_content"]
        detail = api.client.get(f"/api/v1/documents/{document_id}/hidden-content").json()
        assert "Model Rule 4.4(b)" in detail["notice"]
        assert any(
            i["kind"] == "white_text" and "Ignore all previous instructions" in i["text"] for i in detail["items"]
        )
        with api.database.read() as db:
            assert db.execute(text("SELECT count(*) FROM audit_log WHERE action = 'view_hidden_content'")).scalar() == 1
            # The injected instruction never reached a chunk or the index (DEC-59, RISK-07).
            assert (
                db.execute(text("SELECT count(*) FROM chunks WHERE text LIKE '%previous instructions%'")).scalar() == 0
            )
            hits = db.execute(
                text("SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH '\"previous instructions\"'")
            )
            assert hits.scalar() == 0
        assert INJECTION not in api.client.get(f"/api/v1/documents/{document_id}/pages").text

    def test_tracked_changes_read_as_the_document_now_stands(self, api: Api) -> None:
        matter = api.create_matter()
        [document_id] = api.ingest(matter["id"], "acme_redline_other_side.docx")
        page_text = api.client.get(f"/api/v1/documents/{document_id}/pages").text
        assert "ten (10)" in page_text and "sixty (60)" not in page_text


class TestDelete:
    def test_dry_run_then_delete_removes_everything_made_from_it(self, api: Api) -> None:
        matter = api.create_matter()
        [email_id] = api.ingest(matter["id"], "email_from_acme_counsel.eml")
        api.run_jobs()
        chat = api.new_chat(matter["id"])
        turn = api.ask(chat, "What settlement amount does Acme propose?")
        assert turn.answer["citations"]
        api.ask(api.new_chat(matter["id"]), "What settlement does the email propose?")  # a second chat citing it
        api.new_chat(matter["id"])  # a chat that doesn't cite it

        preview = api.client.delete(f"/api/v1/documents/{email_id}?dry_run=true").json()
        removed = preview["removed"]
        assert preview["dry_run"] and removed["documents"] == 2  # the email and its attachment
        assert removed["chunks"] > 0 and removed["vectors"] == removed["fts_rows"] and removed["file_bytes"] > 0
        assert removed["citations"] >= len(turn.answer["citations"])
        assert removed["conversations"] == 2  # INT-1.5: the chats whose answers cite it
        assert api.client.get(f"/api/v1/documents/{email_id}").status_code == 200  # still there

        done = api.client.delete(f"/api/v1/documents/{email_id}").json()
        assert not done["dry_run"] and done["removed"] == removed
        assert api.client.get(f"/api/v1/documents/{email_id}").status_code == 404
        assert api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"] == []
        assert api.client.get(f"/api/v1/conversations/{chat}/messages").json()["items"][-1]["citations"] == []
        assert not any((api.settings.files_dir / matter["id"]).iterdir())
        with api.database.read() as db:
            for table in ("chunks", "pages", "defined_terms", "message_citations"):
                assert db.execute(text(f"SELECT count(*) FROM {table}")).scalar() == 0, table
            assert db.execute(text("SELECT count(*) FROM chunks_vec_rowids")).scalar() == 0
            assert db.execute(text("SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'settle'")).scalar() == 0
