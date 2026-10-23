"""A second real court opinion, found by hand-testing: In re E.S., No. 25-1385 (Iowa Oct. 16, 2026), 10 pages.

Mata v. Avianca was used while the system was tuned; this opinion was not, so it finds what tuning hid. The PDF is
committed (public court opinion) at tests/slow/data. Questions include traps: a false premise, a negation,
facts that sit on the cover page, a footnote, and questions the opinion cannot answer. Writes GOLDEN_REAL_IOWA.md.

    LEGALLENS_COMPARE_MODELS=qwen2.5:7b-instruct uv run pytest -m llm tests/slow/test_real_document_iowa.py -s
"""

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import pytest

from legallens.config import default_data_dir
from legallens.db.migrate import upgrade
from legallens.models.llm import local_status
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.llm

PDF = Path(__file__).resolve().parent / "data" / "in_re_es_iowa_2026.pdf"
MODELS_DIR = default_data_dir() / "models" / "hf"
OUT = Path(__file__).resolve().parents[3] / "GOLDEN_REAL_IOWA.md"


@dataclass
class Case:
    question: str
    must: list[list[str]]  # lower case; each group needs one of its words; [] = the opinion does not say
    note: bool = False  # the answer should carry the good-law note
    refusal_ok: bool = False  # a false premise: refusing is safe, correcting it is better
    states: tuple[str, ...] = ("not_found",)  # acceptable states for a question the opinion cannot answer


CASES = [
    Case("Which justice wrote the opinion of the court?", [["may"]], note=True),
    Case("What did the court hold about delayed appeals where the parent's rights were not terminated?",
         [["negative", "not allowed", "not apply", "only when", "only where", "only if"]], note=True),
    Case("What was the deadline for the mother's petition on appeal and when did she file it?",
         [["september 26"], ["september 27"]]),
    Case("What is the three-part test for a delayed appeal from a termination of parental rights?",
         [["intended to appeal"], ["outside"], ["negligible"]]),
    Case("What is the docket number and the date this opinion was filed?", [["1385"], ["october 16"]]),
    Case("Who represented the State on appeal?", [["bird", "moran"]]),
    Case("Did the juvenile court terminate the mother's parental rights?", [["did not", "not terminate", "dismissed"]]),
    Case("Why did the juvenile court decline to terminate even though it found grounds for termination?",
         [["best interest"]]),
    Case("What does footnote 2 say about standby counsel?", [["need not", "do not decide", "not decide"]]),
    Case("When do the amended rules for CINA and termination appeals take effect, and do they affect this case?",
         [["january 1, 2027"], ["not impact", "do not affect", "not affect", "no impact"]]),
    Case("What did Jones v. State, 981 N.W.2d 141, decide according to this opinion?",
         [["postconviction", "declin"]]),
    Case("Why did the supreme court reverse the court of appeals?", [["affirm"]], refusal_ok=True),
    Case("What did the dissenting justice argue?", []),
    Case("What sentence did the mother receive for the methamphetamine possession arrest?", [],
         states=("not_found", "partial")),
    Case("Is the delayed-appeal rule in this opinion also the law in Texas?", [], states=("not_found", "partial")),
]  # fmt: skip


def test_a_real_court_opinion(tmp_path: Path) -> None:
    models = [m for m in os.environ.get("LEGALLENS_COMPARE_MODELS", "").split(",") if m]
    if not models:
        pytest.skip("Set LEGALLENS_COMPARE_MODELS=model")
    if not (MODELS_DIR / "BAAI--bge-m3").is_dir():
        pytest.skip("Embedding models are not downloaded")
    pdf = PDF
    settings = make_settings(
        tmp_path / "data", embedder="bge-m3", reranker="bge", embed_dim=1024, models_dir=MODELS_DIR,
        model_device="cpu", orchestrator="local",
        converter="docling", docling_artifacts=default_data_dir() / "models" / "docling",
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
        response = api.upload(matter["id"], "in_re_es_iowa_2026.pdf", origin="client", data=pdf.read_bytes())
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
                    ok_text = all(any(alt in content.lower() for alt in group) for group in case.must) or (
                        case.refusal_ok and state == "not_found"
                    )
                    right += ok_text
                    flag = "ok" if ok_text else "MISS"
                else:
                    good = state in case.states
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
        "# Real document: In re E.S. (Iowa 2026), 10 pages\n\n"
        f"```json\n{json.dumps(summary, indent=2)}\n```\n\n"
        "| Question | Result | State | Good-law note | Citations | Answer (start) |\n|---|---|---|---|---|---|\n"
        + "\n".join(rows)
        + "\n"
    )
    OUT.write_text(table)
    print("\n" + table)
