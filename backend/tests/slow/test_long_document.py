"""A 50-page document summarized end to end (CL-2.5, DEC-14: a 50-page summary in 5 minutes or less).

The summary retrieves the best passages per field, so its model context does not grow with the document. This
checks that: time, and that a figure on page 37 of 50 still reaches the amounts field.

    uv run pytest -m llm tests/slow/test_long_document.py -s
"""

import time
from pathlib import Path

import pymupdf
import pytest

from legallens.config import default_data_dir
from legallens.db.migrate import upgrade
from legallens.models.llm import local_status
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.llm

MODELS_DIR = default_data_dir() / "models" / "hf"
PAGES = 50
NEEDLE = "$73,250"


def long_letter() -> bytes:
    doc = pymupdf.open()
    filler = (
        "Under the Master Services Agreement the parties agreed to the scope of services, the schedule of "
        "deliveries and the reporting duties set out in the exhibits. Acme reserves all of its rights and "
        "remedies, and nothing in this letter waives any of them. "
    )
    for n in range(1, PAGES + 1):
        page = doc.new_page()
        lines = [f"Section {n}. {filler * 3}"]
        if n == 1:
            lines.insert(0, "WHITFIELD & GRANT LLP. Dana Whitfield, counsel for Acme Corp. Dear Sir or Madam:")
        if n == 37:
            lines.append(f"Acme demands payment of {NEEDLE} in overdue fees within fourteen (14) days.")
        if n == PAGES:
            lines.append("If Smith does not comply, Acme will file suit. Sincerely, Dana Whitfield.")
        page.insert_textbox(pymupdf.Rect(60, 60, 540, 780), "\n\n".join(lines), fontsize=10)
    return doc.tobytes()


def test_a_fifty_page_summary(tmp_path: Path) -> None:
    if not (MODELS_DIR / "BAAI--bge-m3").is_dir():
        pytest.skip("Embedding models are not downloaded")
    settings = make_settings(
        tmp_path / "data", embedder="bge-m3", reranker="bge", embed_dim=1024, models_dir=MODELS_DIR,
        model_device="cpu", orchestrator="local",
    )  # fmt: skip
    ok, detail = local_status(settings)
    if not ok and "not pulled" not in detail:
        pytest.skip(f"Ollama is not ready: {detail}")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=1024)
    client = signed_in_client(settings)
    try:
        api = Api(client, settings, tmp_path)
        matter = api.create_matter()
        response = api.upload(matter["id"], "long_demand.pdf", origin="other_party", data=long_letter())
        assert response.status_code == 202, response.text
        document = response.json()["document_id"]
        api.run_jobs()
        started = time.monotonic()
        made = client.post(
            f"/api/v1/documents/{document}/summaries", json={"template": "letter_demand", "audience": "detailed"}
        ).json()
        api.run_jobs()
        seconds = time.monotonic() - started
        summary = client.get(f"/api/v1/summaries/{made['summary_id']}").json()
    finally:
        client.__exit__(None, None, None)
    by_field = {s["field"]: s for s in summary["sections"]}
    print(f"\n50-page summary: {seconds:.0f} s, status {summary['status']}, model {summary['model_id']}")
    for name, section in by_field.items():
        print(f"- {name}: {section['content'][:120]!r}")
    assert summary["status"] == "ready"
    assert seconds <= 300, "DEC-14: a 50-page summary in 5 minutes or less"
    assert NEEDLE in by_field["amounts"]["content"] or NEEDLE in by_field["demands"]["content"]
