"""Compares local models on SUMMARY and DRAFT with the sample demand letter. Writes MODEL_COMPARISON_SUMMARY_DRAFT.md.

    LEGALLENS_COMPARE_MODELS=qwen2.5:7b-instruct,qwen2.5:14b-instruct \\
        uv run pytest -m llm tests/slow/test_summary_draft_comparison.py -s
"""

import os
import time
from pathlib import Path

import pytest

from tests.conftest import Api

pytestmark = pytest.mark.llm

OUT = Path(__file__).resolve().parents[3] / "MODEL_COMPARISON_SUMMARY_DRAFT.md"

# Each field must mention one of its alternatives (lower case).
GOLD = {
    "sender": ["whitfield", "dana"],
    "recipient": ["smith logistics"],
    "demands": ["48,500"],
    "deadlines": ["september 29", "fourteen", "14", "ten (10)"],
    "claims": ["late", "deliver", "4.2", "breach"],
    "threats": ["suit", "attorney"],
    "amounts": ["48,500"],
}


def test_compare_summary_and_draft(api: Api) -> None:
    models = [m for m in os.environ.get("LEGALLENS_COMPARE_MODELS", "").split(",") if m]
    if not models:
        pytest.skip("Set LEGALLENS_COMPARE_MODELS=model1,model2")
    api.settings.orchestrator = "local"
    matter = api.create_matter()
    msa, letter = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
    rows: list[str] = []
    notes: list[str] = []
    for model in models:
        api.settings.llm_summary_model = model
        api.settings.llm_draft_model = model

        started = time.monotonic()
        made = api.client.post(
            f"/api/v1/documents/{letter}/summaries", json={"template": "letter_demand", "audience": "detailed"}
        ).json()
        api.run_jobs()
        summary = api.client.get(f"/api/v1/summaries/{made['summary_id']}").json()
        summary_s = time.monotonic() - started
        by_field = {s["field"]: s for s in summary["sections"]}
        right = [
            f for f, alts in GOLD.items() if f in by_field and any(a in by_field[f]["content"].lower() for a in alts)
        ]
        distinct = len({by_field[f]["content"] for f in by_field})
        for f in GOLD:
            if f not in right:
                notes.append(
                    f"- {model} summary `{f}` wrong or missing: {by_field.get(f, {}).get('content', '')[:140]!r}"
                )

        started = time.monotonic()
        turn = api.ask(
            api.new_chat(matter["id"]),
            "Draft a response letter to the demand",
            mode="draft",
            options={"incoming_document_id": letter, "supporting_document_ids": [msa]},
        )
        draft_id = turn.first("job")["entity_id"]
        api.run_jobs()
        draft = api.client.get(f"/api/v1/drafts/{draft_id}").json()
        draft_s = time.monotonic() - started
        points = [s for s in draft["sections"] if s["kind"] == "point"]
        from_msa = [p for p in points if any(c["document_id"] == msa for c in p["citations"])]
        cite_needed = sum(1 for p in draft["placeholders"] if p["kind"] == "cite_needed")
        for p in points[:3]:
            notes.append(f"- {model} draft point: {p['content'][:260]!r}")
        rows.append(
            f"| {model} | {len(right)}/{len(GOLD)} | {distinct}/{len(by_field)} | {summary_s:.0f} s "
            f"| {len(from_msa)}/{len(points)} | {cite_needed} | {draft_s:.0f} s |"
        )

    table = (
        "# Summary and draft: local model comparison\n\n"
        "| Model | Summary fields right | Distinct field texts | Summary time | Draft points citing the MSA "
        "| CITE NEEDED left | Draft time |\n|---|---|---|---|---|---|---|\n"
        + "\n".join(rows)
        + "\n\n## Notes\n\n"
        + "\n".join(notes)
        + "\n"
    )
    OUT.write_text(table)
    print("\n" + table)
