"""How the reranker's top score separates answerable from unanswerable questions (CL-2.2).

Not a pass/fail test: it prints a table and writes GATE_BENCHMARK.md so a gate threshold can be chosen from data.
    uv run pytest -m slow tests/slow/test_gate_benchmark.py -s
"""

from pathlib import Path

import pytest
from sqlalchemy import text as sql

from legallens.config import default_data_dir
from legallens.db.migrate import upgrade
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.slow

MODELS = default_data_dir() / "models" / "hf"
DOCS = ["smith_msa_v3.pdf", "exhibit_b_invoices.pdf", "email_from_acme_counsel.eml"]
OUT = Path(__file__).resolve().parents[3] / "GATE_BENCHMARK.md"

ANSWERABLE = [
    "How much notice is needed to terminate for convenience?",
    "What interest applies to late payments?",
    "What is the cap on each party's liability?",
    "What is the monthly fee for warehousing?",
    "How must a termination notice be delivered?",
    "How long does a party have to cure a material breach?",
    "Within how many days must Confidential Information be returned?",
    "What is the total unpaid amount on the invoices?",
    "Which invoices are unpaid?",
    "What settlement amount did Acme's counsel propose, and by when?",
    "Can we end the agreement early?",
    "What happens if Acme pays late?",
    "Where should notices to Smith be sent?",
    "How long does the agreement last?",
]
UNANSWERABLE = [
    "What law governs this agreement?",
    "What is the recipe for blueberry pancakes?",
    "Who is the chief executive of Acme Corp?",
    "Is there an arbitration clause?",
    "What insurance must Smith carry?",
    "What is the warranty period for the services?",
    "What is the weather forecast for Tokyo tomorrow?",
    "How many employees does Smith Logistics have?",
    "Does the agreement include a non-compete?",
    "What is the capital of France?",
]


def test_gate_benchmark(tmp_path: Path) -> None:
    if not (MODELS / "BAAI--bge-m3").is_dir() or not (MODELS / "BAAI--bge-reranker-v2-m3").is_dir():
        pytest.skip("Models are not downloaded")
    settings = make_settings(
        tmp_path / "data", embedder="bge-m3", reranker="bge", embed_dim=1024, models_dir=MODELS, model_device="cpu"
    )
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=1024)
    from legallens.samples.generate import ORIGINS, write_sample

    samples = tmp_path / "samples"
    samples.mkdir()
    for name in ORIGINS:
        write_sample(name, samples)
    client = signed_in_client(settings)
    try:
        api = Api(client, settings, samples)
        matter = api.create_matter()
        api.ingest(matter["id"], *DOCS)
        rows = []
        for answerable, questions in ((True, ANSWERABLE), (False, UNANSWERABLE)):
            for question in questions:
                turn = api.ask(api.new_chat(matter["id"]), question)
                with api.database.read() as db:
                    row = db.execute(
                        sql("SELECT fused_json, gate_score FROM retrieval_traces ORDER BY id DESC LIMIT 1")
                    ).one()
                fused = row[0] if isinstance(row[0], list) else __import__("json").loads(row[0])
                scores = [f["rerank"] for f in fused if "rerank" in f]
                rows.append((answerable, question, max(scores, default=0.0), row[1], turn.answer["answer_state"]))
    finally:
        client.__exit__(None, None, None)

    lines = [
        "# Gate benchmark: top reranker score\n",
        "| Answerable | Question | Top rerank score | Keyword gate score | State today |",
        "|---|---|---|---|---|",
    ]
    lines += [f"| {'yes' if a else 'no'} | {q} | {top:.3f} | {g:.2f} | {st} |" for a, q, top, g, st in rows]
    yes = sorted(r[2] for r in rows if r[0])
    no = sorted(r[2] for r in rows if not r[0])
    lines.append(f"\nAnswerable: min {yes[0]:.3f}, median {yes[len(yes) // 2]:.3f}.")
    lines.append(f"Unanswerable: max {no[-1]:.3f}, median {no[len(no) // 2]:.3f}.\n")
    OUT.write_text("\n".join(lines))
    print("\n" + "\n".join(lines))
