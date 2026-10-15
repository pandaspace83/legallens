"""Golden set v1 (DEF-01): 34 questions on the sample documents, scored automatically, per answer model.

Real retrieval (bge-m3 and the reranker), the real local models and the real checker. Writes GOLDEN_SET.md.

    LEGALLENS_COMPARE_MODELS=qwen2.5:7b-instruct,qwen2.5:14b-instruct \\
        uv run pytest -m llm tests/slow/test_golden_set.py -s

Scoring per answerable question: the answer holds the expected facts, the right document is cited, every citation
is verified, and the state is found. Per unanswerable question: the state is not_found (nothing invented).
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
from legallens.samples.generate import ORIGINS, write_sample
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.llm

MODELS_DIR = default_data_dir() / "models" / "hf"
DOCS = ["smith_msa_v3.pdf", "exhibit_b_invoices.pdf", "email_from_acme_counsel.eml", "email_from_smith_client.eml"]
OUT = Path(__file__).resolve().parents[3] / "GOLDEN_SET.md"


@dataclass
class Case:
    question: str
    must: list[list[str]]  # each group needs one alternative in the answer (lower case); [] = unanswerable
    doc: str = ""  # a substring of the document that should be cited


MSA, INV, EML, CLI = "smith_msa_v3", "exhibit_b_invoices", "email_from_acme", "email_from_smith"
CASES = [
    Case("How much notice is needed to terminate for convenience?", [["60", "sixty"]], MSA),
    Case("What interest applies to late payments?", [["1%", "one percent"]], MSA),
    Case("What is the cap on each party's liability?", [["12", "twelve"]], MSA),
    Case("What is the monthly fee for warehousing?", [["8,500"]], MSA),
    Case("How much is the freight brokerage fee?", [["12,000"]], MSA),
    Case("What is the charge for expedited handling?", [["450"]], MSA),
    Case("How must a termination notice be delivered?", [["courier"], ["certified"]], MSA),
    Case("How long does a party have to cure a material breach?", [["30", "thirty"]], MSA),
    Case("Within how many days must Confidential Information be returned?", [["10", "ten"]], MSA),
    Case("How long does the agreement last?", [["three", "3"]], MSA),
    Case("When did the agreement take effect?", [["march 1, 2025"]], MSA),
    Case("Can we end the agreement early?", [["60", "sixty", "30", "thirty"]], MSA),
    Case("What happens if Acme pays late?", [["interest", "1%", "one percent"]], MSA),
    Case("Where should notices to Smith be sent?", [["200 harbor way", "oakland"]], MSA),
    Case("Is either side liable for consequential damages?", [["not liable", "neither", "indirect"]], MSA),
    Case("How many days does Acme have to pay an invoice?", [["30", "thirty"]], MSA),
    Case("What is the total unpaid amount on the invoices?", [["48,500"]], INV),
    Case("Which invoices are unpaid?", [["2077"], ["2103"]], INV),
    Case("How much was invoice INV-2103 for?", [["24,500"]], INV),
    Case("Which invoice has been paid?", [["2041"]], INV),
    Case("Why is Acme withholding payment of INV-2077?", [["late delivery", "dispute", "withheld"]], INV),
    Case("What settlement amount did Acme's counsel propose, and by when?", [["40,000"], ["october 15"]], EML),
    Case("Who sent the settlement email?", [["whitfield"]], EML),
    Case("Who sent the email about the delivery logs?", [["raman", "priya"]], CLI),
    Case("On what dates did Acme sign for the July deliveries?", [["july 9"], ["july 23"]], CLI),
    Case("When did the July deliveries leave the Oakland warehouse?", [["july 8"], ["july 22"]], CLI),
    # The answer is in the email's attachment, settlement_terms.pdf.
    Case("What do the settlement terms say about claims?", [["release", "releases"]], "settlement_terms"),
    Case("What law governs this agreement?", []),
    Case("What is the recipe for blueberry pancakes?", []),
    Case("Who is the chief executive of Acme Corp?", []),
    Case("Is there an arbitration clause?", []),
    Case("What insurance must Smith carry?", []),
    Case("What is the warranty period for the services?", []),
    Case("How many employees does Smith Logistics have?", []),
    Case("Does the agreement include a non-compete?", []),
    Case("What is the capital of France?", []),
    Case("What is the weather forecast for Tokyo tomorrow?", []),
]  # fmt: skip


def test_golden_set(tmp_path: Path) -> None:
    names = [m for m in os.environ.get("LEGALLENS_COMPARE_MODELS", "").split(",") if m]
    if not names:
        pytest.skip("Set LEGALLENS_COMPARE_MODELS=model1,model2")
    if not (MODELS_DIR / "BAAI--bge-m3").is_dir():
        pytest.skip("Embedding models are not downloaded")
    settings = make_settings(
        tmp_path / "data",
        embedder="bge-m3",
        reranker="bge",
        embed_dim=1024,
        models_dir=MODELS_DIR,
        model_device="cpu",
        orchestrator="local",
    )
    ok, detail = local_status(settings)
    if not ok and "not pulled" not in detail:
        pytest.skip(f"Ollama is not ready: {detail}")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=1024)
    samples = tmp_path / "samples"
    samples.mkdir()
    for name in ORIGINS:
        write_sample(name, samples)
    client = signed_in_client(settings)
    summary_rows: list[str] = []
    results: dict[str, dict[str, float]] = {}
    unverified: list[dict[str, object]] = []
    detail_rows: list[str] = []
    try:
        api = Api(client, settings, samples)
        matter = api.create_matter()
        api.ingest(matter["id"], *DOCS)
        # File names of every document in the matter, attachments included.
        listing = client.get(f"/api/v1/matters/{matter['id']}/documents").json()
        doc_names = {d["id"]: d["filename"] for d in listing["items"]}
        for model in names:
            settings.llm_answer_model = model
            right = cited = verified = refused = invented = 0
            total_s = 0.0
            for case in CASES:
                started = time.monotonic()
                turn = api.ask(api.new_chat(matter["id"]), case.question)
                total_s += time.monotonic() - started
                content = str(turn.answer["content"])
                state = turn.answer["answer_state"]
                citations = turn.answer["citations"]
                if case.must:
                    low = content.lower()
                    ok_text = all(any(alt in low for alt in group) for group in case.must)
                    ok_doc = any(case.doc in doc_names.get(c["document_id"], "") for c in citations)
                    ok_ver = bool(citations) and all(c["verified"] for c in citations)
                    if not ok_ver:
                        unverified.append(
                            {
                                "model": model,
                                "question": case.question,
                                "state": state,
                                "answer": content,
                                "citations": [
                                    {"n": c["n"], "verified": c["verified"], "quote": c["quote"], "page": c["page"]}
                                    for c in citations
                                ],
                            }
                        )
                    right += ok_text
                    cited += ok_doc
                    verified += ok_ver
                    flag = "ok" if (ok_text and ok_doc) else "MISS"
                else:
                    good = state == "not_found"
                    refused += good
                    invented += not good
                    flag = "ok" if good else "INVENTED"
                detail_rows.append(
                    f"| {model} | {case.question} | {flag} | {state} | {len(citations)} | {content[:90]!r} |"
                )
            answerable = sum(1 for c in CASES if c.must)
            unanswerable = len(CASES) - answerable
            results[model] = {
                "questions": len(CASES),
                "answerable": answerable,
                "correct": right,
                "right_document": cited,
                "verified": verified,
                "unanswerable": unanswerable,
                "refused": refused,
                "invented": invented,
                "seconds_per_question": round(total_s / len(CASES), 1),
            }
            summary_rows.append(
                f"| {model} | {right}/{answerable} | {cited}/{answerable} | {verified}/{answerable} "
                f"| {refused}/{unanswerable} | {invented} | {total_s / len(CASES):.1f} s |"
            )
    finally:
        client.__exit__(None, None, None)

    table = (
        "# Golden set v1\n\n"
        f"{len(CASES)} questions on {', '.join(DOCS)}; bge-m3 + bge-reranker-v2-m3; rewrite model "
        f"{settings.llm_rewrite_model}.\n\n"
        "| Model | Correct | Right document cited | All citations verified | Correct 'not found' "
        "| Invented answers | Avg per question |\n|---|---|---|---|---|---|---|\n"
        + "\n".join(summary_rows)
        + "\n\n## Per question\n\n| Model | Question | Result | State | Citations | Answer (start) |\n"
        "|---|---|---|---|---|---|\n" + "\n".join(detail_rows) + "\n"
    )
    OUT.write_text(table)
    OUT.with_suffix(".json").write_text(json.dumps(results, indent=2))
    OUT.with_name("GOLDEN_UNVERIFIED.json").write_text(json.dumps(unverified, indent=2, ensure_ascii=False))
    print("\n" + table)
