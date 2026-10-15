"""The real engines: Docling (layout, TableFormer, Tesseract OCR) and ClamAV. Run with `pytest -m slow`."""

import os
from pathlib import Path

import pytest
from sqlalchemy import text

from legallens.config import default_data_dir
from legallens.ingestion.scanner import ClamdScanner
from tests.conftest import Api

pytestmark = pytest.mark.slow

ARTIFACTS = Path(os.environ.get("LEGALLENS_DOCLING_ARTIFACTS", default_data_dir() / "models" / "docling"))
CLAMD = Path("/opt/homebrew/var/run/clamav/clamd.sock")
EICAR = rb"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


@pytest.fixture
def docling_api(api: Api) -> Api:
    if not ARTIFACTS.exists():
        pytest.skip("Docling models are not downloaded (uv run legallens models download)")
    api.settings.converter = "docling"
    api.settings.docling_artifacts = ARTIFACTS
    return api


def test_docling_ingests_tables_ocr_and_clause_numbers(docling_api: Api) -> None:
    api = docling_api
    matter = api.create_matter()
    msa, letter, exhibit = api.ingest(
        matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf", "exhibit_b_invoices.pdf"
    )
    with api.database.read() as db:
        kinds = dict(
            db.execute(text("SELECT kind, count(*) FROM chunks WHERE document_id = :d GROUP BY kind"), {"d": msa}).all()
        )
        refs = {r[0] for r in db.execute(text("SELECT clause_ref FROM chunks WHERE document_id = :d"), {"d": msa})}
    assert kinds.get("table") == 1
    assert {"1.1", "2.1", "7.1", "9.1"} <= refs
    scanned = api.client.get(f"/api/v1/documents/{letter}").json()
    assert scanned["coverage"]["ocr_pages"] == [1] and scanned["ocr_conf_avg"] > 0.85
    assert api.client.get(f"/api/v1/documents/{exhibit}").json()["coverage"]["pages_read"] == 2
    turn = api.ask(api.new_chat(matter["id"]), "How must a termination notice be delivered?")
    assert turn.answer["citations"][0]["para_ref"] == "4.2(b)"


def test_clamav_quarantines_eicar(api: Api) -> None:
    if not ClamdScanner(CLAMD).ping():
        pytest.skip("clamd is not running (brew services start clamav)")
    api.settings.scanner = "clamd"
    api.settings.clamd_socket = CLAMD
    matter = api.create_matter()
    response = api.upload(matter["id"], "eicar.txt", "other_party", EICAR)
    assert (response.status_code, response.json()["code"]) == (422, "malware_detected")
    clean = api.upload(matter["id"], "rivera_lease.txt")
    assert clean.status_code == 202
    documents = api.client.get(f"/api/v1/matters/{matter['id']}/documents").json()["items"]
    assert {(d["filename"], d["scan_status"]) for d in documents} == {
        ("eicar.txt", "infected"),
        ("rivera_lease.txt", "clean"),
    }
