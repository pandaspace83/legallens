"""A golden test for summaries, which nothing guarded before: each field of a summary is checked against what the
document says, and the run reports speed beside quality so a setting (passages per field) can be tuned against it.

Three documents: a demand letter (short: the model reads it whole), a 10-page Iowa opinion and the 43-page Mata v.
Avianca opinion (long: the model reads the passages that match each field; Mata uses the long-document model).
A field is correct when every group of expected words has one of its words in the field's text (loose on purpose:
it asks whether the right content is there, not how it is worded). "Written" means the model wrote it; a field
made only of quotations is the fallback after the model's answer failed a check. Writes GOLDEN_SUMMARY.md.

    LEGALLENS_SUMMARY_PASSAGES=10,6 uv run pytest -m llm tests/slow/test_summary_golden.py -s
"""

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from legallens.config import default_data_dir
from legallens.db.migrate import upgrade
from legallens.models.llm import local_status
from legallens.samples.generate import write_sample
from tests.conftest import Api, make_settings, signed_in_client

pytestmark = pytest.mark.llm

MODELS_DIR = default_data_dir() / "models" / "hf"
DOCLING_DIR = default_data_dir() / "models" / "docling"
HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / "GOLDEN_SUMMARY.md"
OUT_JSON = HERE.parents[2] / "GOLDEN_SUMMARY.json"
QUOTED = re.compile(r"[“\"][^”\"]*[”\"]")


@dataclass
class Doc:
    name: str
    path: Path | None  # None: one of the generated samples
    origin: str
    template: str
    expect: dict[str, list[list[str]]] = field(default_factory=dict)


DOCS = [
    Doc("acme_demand_letter_scanned.pdf", None, "other_party", "letter_demand", {
        "sender": [["whitfield"]],
        "recipient": [["smith"]],
        "demands": [["48,500"]],
        "deadlines": [["september 29", "fourteen", "14", "ten (10)", "10 days"]],
        "claims": [["breach"]],
        "threats": [["suit", "attorney"]],
        "amounts": [["48,500"]],
    }),
    Doc("in_re_es_iowa_2026.pdf", HERE / "data" / "in_re_es_iowa_2026.pdf", "client", "opinion", {
        "facts": [["methamphetamine"], ["father"]],
        "posture": [["delayed appeal", "untimely", "late"], ["court of appeals"]],
        "issue": [["delayed"], ["terminat"]],
        "holding": [
            ["not apply", "should not", "does not apply", "not allowed", "not available", "only when", "only where"],
            ["terminat"],
        ],
        "reasoning": [["modif", "not final", "final"], ["terminat"]],
        "disposition": [["affirm"], ["dismiss"]],
    }),
    Doc("mata_v_avianca_sanctions.pdf", HERE / "_cache" / "mata_v_avianca_sanctions.pdf", "client", "opinion", {
        "facts": [["chatgpt", "fake", "nonexistent", "does not exist", "varghese"]],
        "posture": [["sanction", "motion to dismiss", "show cause", "rule 11"]],
        "issue": [["sanction", "rule 11", "bad faith"]],
        "holding": [["sanction", "penalty", "5,000", "bad faith"]],
        "reasoning": [["rule 11", "bad faith", "fake", "nonexistent", "citation"]],
        "disposition": [["5,000", "penalty", "sanction"]],
    }),
]  # fmt: skip


def _written(content: str) -> bool:
    """The model wrote it: some prose is left once the quotations, markers and bullets are removed."""
    rest = QUOTED.sub(" ", content)
    rest = re.sub(r"\[\d+\]|^[\s\-*•]+", " ", rest, flags=re.M)
    return len(" ".join(rest.split())) >= 25


def test_summaries_against_what_the_documents_say(tmp_path: Path) -> None:
    variants = [int(v) for v in os.environ.get("LEGALLENS_SUMMARY_PASSAGES", "10").split(",") if v]
    wanted = [d for d in DOCS if d.path is None or d.path.exists()]
    if not (MODELS_DIR / "BAAI--bge-m3").is_dir() or not DOCLING_DIR.is_dir():
        pytest.skip("Embedding or Docling models are not downloaded")
    settings = make_settings(
        tmp_path / "data", embedder="bge-m3", reranker="bge", embed_dim=1024, models_dir=MODELS_DIR,
        model_device="cpu", orchestrator="local", converter="docling", docling_artifacts=DOCLING_DIR,
    )  # fmt: skip
    ok, detail = local_status(settings)
    if not ok and "not pulled" not in detail:
        pytest.skip(f"Ollama is not ready: {detail}")
    settings.ensure_dirs()
    upgrade(settings.db_path, embed_dim=1024)
    client = signed_in_client(settings)
    rows: list[dict[str, object]] = []
    try:
        api = Api(client, settings, tmp_path)
        matter = api.create_matter()
        docs: dict[str, str] = {}
        for doc in wanted:
            data = doc.path.read_bytes() if doc.path else write_sample(doc.name, tmp_path / "samples").read_bytes()
            response = api.upload(matter["id"], doc.name, origin=doc.origin, data=data)
            assert response.status_code == 202, response.text
            docs[doc.name] = response.json()["document_id"]
        api.run_jobs()
        for passages in variants:
            settings.summary_field_passages = passages
            for doc in wanted:
                started = time.monotonic()
                accepted = client.post(
                    f"/api/v1/documents/{docs[doc.name]}/summaries",
                    json={"template": doc.template, "audience": "detailed"},
                )
                assert accepted.status_code == 202, accepted.text
                api.run_jobs()
                seconds = round(time.monotonic() - started)
                summary = client.get(f"/api/v1/summaries/{accepted.json()['summary_id']}").json()
                fields = {s["field"]: s for s in summary["sections"]}
                results = {}
                for key, groups in doc.expect.items():
                    section = fields.get(key, {"content": "", "citations": []})
                    content = str(section["content"]).lower()
                    results[key] = {
                        "correct": all(any(w in content for w in group) for group in groups),
                        "written": _written(str(section["content"])),
                        "cited": bool(section["citations"]),
                        "content": str(section["content"])[:400],
                    }
                rows.append({"passages": passages, "document": doc.name, "model": summary.get("model_id"),
                             "seconds": seconds, "fields": results})  # fmt: skip
    finally:
        client.__exit__(None, None, None)
    OUT_JSON.write_text(json.dumps(rows, indent=2))
    lines = [
        "# Summary golden test\n",
        "| Passages per field | Document | Model | Seconds | Correct | Written by the model | Cited |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        f = r["fields"]  # type: ignore[assignment]
        total = len(f)
        lines.append(
            f"| {r['passages']} | {r['document']} | {r['model']} | {r['seconds']} | "
            f"{sum(v['correct'] for v in f.values())}/{total} | {sum(v['written'] for v in f.values())}/{total} | "
            f"{sum(v['cited'] for v in f.values())}/{total} |"
        )
    lines.append("\n## Fields that were not correct\n")
    for r in rows:
        for key, v in r["fields"].items():  # type: ignore[attr-defined]
            if not v["correct"]:
                lines.append(f"- {r['passages']} passages, {r['document']}, **{key}**: {v['content']!r}")
    OUT.write_text("\n".join(lines) + "\n")
    print("\n" + "\n".join(lines))
