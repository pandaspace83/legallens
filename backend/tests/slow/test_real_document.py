"""A real, public court opinion through the whole pipeline (not a document we wrote).

Mata v. Avianca, Inc., No. 22-cv-1461 (S.D.N.Y. June 22, 2023), Opinion and Order on Sanctions: 43 pages, a US
district court opinion (public domain). It is fetched on first use from CourtListener into tests/slow/_cache
(git-ignored) and skipped when offline. Questions use the phrasings a lawyer would use, with answers read from
the opinion itself. Writes GOLDEN_REAL.md.

    LEGALLENS_COMPARE_MODELS=qwen2.5:7b-instruct uv run pytest -m llm tests/slow/test_real_document.py -s
"""

import json
import os
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import pytest

from legallens.config import default_data_dir
from legallens.db.migrate import upgrade
from legallens.models.llm import local_status
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.llm

URL = "https://storage.courtlistener.com/recap/gov.uscourts.nysd.575368/gov.uscourts.nysd.575368.54.0.pdf"
CACHE = Path(__file__).resolve().parent / "_cache" / "mata_v_avianca_sanctions.pdf"
MODELS_DIR = default_data_dir() / "models" / "hf"
OUT = Path(__file__).resolve().parents[3] / "GOLDEN_REAL.md"


@dataclass
class Case:
    question: str
    must: list[list[str]]  # lower case; [] = the opinion does not say
    note: bool = False  # the answer should carry the good-law note


CASES = [
    Case("How much was the sanction the court imposed?", [["5,000"]], note=True),
    Case("Who has to pay the penalty, and how?", [["jointly and severally"]]),
    Case("How many days do the respondents have to pay?", [["14", "fourteen"]]),
    Case("Which AI tool produced the fake cases?", [["chatgpt"]], note=True),
    Case("Who is the judge in this case?", [["castel"]]),
    Case("What court issued this opinion?", [["southern district of new york"]]),
    Case("What was Avianca's motion to dismiss based on?", [["montreal convention", "time-barred", "time barred"]]),
    Case("Which federal rule did the lawyers violate?", [["rule 11"]]),
    Case("Did the court find that Mr. LoDuca acted in bad faith?", [["bad faith"]]),
    Case("What is the name of the first fake decision that was cited?", [["varghese"]]),
    Case("Does the court require the lawyers to notify anyone?", [["letter", "inform", "notify"]]),
    Case("Which law firm were the respondents with?", [["levidow"]]),
    Case("What is Avianca's annual revenue?", []),
    Case("What is the recipe for blueberry pancakes?", []),
    Case("How many passengers did Avianca carry last year?", []),
]  # fmt: skip


def _fetch() -> Path | None:
    if CACHE.exists():
        return CACHE
    try:
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(URL, timeout=60) as response:
            CACHE.write_bytes(response.read())
        return CACHE
    except OSError:
        return None


def test_a_real_court_opinion(tmp_path: Path) -> None:
    models = [m for m in os.environ.get("LEGALLENS_COMPARE_MODELS", "").split(",") if m]
    if not models:
        pytest.skip("Set LEGALLENS_COMPARE_MODELS=model")
    if not (MODELS_DIR / "BAAI--bge-m3").is_dir():
        pytest.skip("Embedding models are not downloaded")
    pdf = _fetch()
    if pdf is None:
        pytest.skip("The opinion could not be fetched (offline)")
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
    rows: list[str] = []
    summary: dict[str, dict[str, float]] = {}
    try:
        api = Api(client, settings, tmp_path)
        matter = api.create_matter()
        started = time.monotonic()
        response = api.upload(matter["id"], "mata_v_avianca_sanctions.pdf", origin="client", data=pdf.read_bytes())
        assert response.status_code == 202, response.text
        api.run_jobs()
        ingest_s = time.monotonic() - started
        for model in models:
            settings.llm_answer_model = model
            right = refused = invented = noted = needed = 0
            for case in CASES:
                turn = api.ask(api.new_chat(matter["id"]), case.question)
                content = str(turn.answer["content"])
                state = turn.answer["answer_state"]
                if case.must:
                    ok_text = all(any(alt in content.lower() for alt in group) for group in case.must)
                    right += ok_text
                    flag = "ok" if ok_text else "MISS"
                else:
                    good = state == "not_found"
                    refused += good
                    invented += not good
                    flag = "ok" if good else "INVENTED"
                has_note = "Good law not checked" in content
                if case.note:
                    needed += 1
                    noted += has_note
                rows.append(
                    f"| {case.question} | {flag} | {state} | {'yes' if has_note else 'no'} | "
                    f"{len(turn.answer['citations'])} | {content[:110]!r} |"
                )
            answerable = sum(1 for c in CASES if c.must)
            summary[model] = {
                "answerable": answerable,
                "correct": right,
                "unanswerable": len(CASES) - answerable,
                "refused": refused,
                "invented": invented,
                "note_expected": needed,
                "note_present": noted,
                "ingest_seconds": round(ingest_s),
            }
    finally:
        client.__exit__(None, None, None)
    table = (
        "# Real document: Mata v. Avianca (S.D.N.Y. 2023), sanctions opinion, 43 pages\n\n"
        f"```json\n{json.dumps(summary, indent=2)}\n```\n\n"
        "| Question | Result | State | Good-law note | Citations | Answer (start) |\n|---|---|---|---|---|---|\n"
        + "\n".join(rows)
        + "\n"
    )
    OUT.write_text(table)
    print("\n" + table)
