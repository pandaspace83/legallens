"""SUMMARY with the local model, inside the summarize job (WORKFLOWS_TODO W3). The model is a scripted fake."""

import re
from collections.abc import Callable
from typing import Any

import pytest

import legallens.jobs.handlers.summarize as summarize_job
from legallens.models.llm import LLMError
from tests.conftest import Api
from tests.llm.fakes import FakeChat

CANARY = "ZEBRA-CANARY-7f3a9c"
SUMMARY_MODEL = "summary-m"


def first_passage(user: str) -> tuple[int, str]:
    match = re.search(r'<passage n="(\d+)"[^>]*>\n(.*?)\n</passage>', user, re.S)
    assert match
    return int(match.group(1)), match.group(2)


def cited(model: str, system: str, user: str) -> str:
    n, text = first_passage(user)
    sentence = re.split(r"(?<=[.;])\s", " ".join(text.split()))[0]
    return f"The document states this. “{sentence}” [{n}]"


@pytest.fixture
def run_summary(api: Api, monkeypatch: pytest.MonkeyPatch) -> Callable[..., tuple[dict[str, Any], FakeChat]]:
    def go(
        reply: Any,
        audience: str = "detailed",
        fail: Exception | None = None,
        document_name: str = "acme_demand_letter_scanned.pdf",
    ) -> tuple[dict[str, Any], FakeChat]:
        api.settings.orchestrator = "local"
        api.settings.llm_summary_model = SUMMARY_MODEL
        fake = FakeChat(reply, fail=fail)
        monkeypatch.setattr(summarize_job, "get_llm", lambda settings: fake)
        matter = api.create_matter()
        [document] = api.ingest(matter["id"], document_name)
        started = api.client.post(
            f"/api/v1/documents/{document}/summaries", json={"template": "letter_demand", "audience": audience}
        ).json()
        api.run_jobs()
        return api.client.get(f"/api/v1/summaries/{started['summary_id']}").json(), fake

    return go


def test_each_field_is_written_by_the_model_with_global_citation_numbers(run_summary) -> None:  # type: ignore[no-untyped-def]
    summary, fake = run_summary(cited)
    assert summary["status"] == "ready"
    assert summary["model_id"] == SUMMARY_MODEL
    assert len(fake.calls) == 7  # one per template field
    assert all("The document states this." in s["content"] for s in summary["sections"])
    numbers = [c["n"] for s in summary["sections"] for c in s["citations"]]
    assert numbers == sorted(set(numbers)) and numbers[0] == 1  # unique and increasing across fields
    for section in summary["sections"]:
        for c in section["citations"]:
            assert f"[{c['n']}]" in section["content"]


def test_a_short_document_is_sent_whole_in_reading_order(run_summary) -> None:  # type: ignore[no-untyped-def]
    _, fake = run_summary(cited, document_name="smith_msa_v3.pdf")
    user = fake.calls[0]["user"]
    ns = [int(n) for n in re.findall(r'<passage n="(\d+)"', user)]
    assert ns == list(range(1, len(ns) + 1)) and len(ns) >= 2
    assert "Summarize" in user.split("PASSAGES:")[0]


def test_a_model_not_found_never_hides_passages_the_keywords_match(run_summary) -> None:  # type: ignore[no-untyped-def]
    """Review finding 3: a missed deadline is worse than an extra quote."""
    summary, _ = run_summary("Not found in this document.")
    deadlines = next(s for s in summary["sections"] if s["field"] == "deadlines")
    assert deadlines["citations"], "the letter states its deadlines; the field must show them"
    assert summary["model_id"] == "stub-orchestrator"  # no field was written by the model


def test_a_claim_with_an_invented_number_falls_back_to_quoted_passages(run_summary) -> None:  # type: ignore[no-untyped-def]
    summary, _ = run_summary("They demand 987,654 dollars within 77 days [1].")
    for section in summary["sections"]:
        assert "987,654" not in section["content"]
        assert section["citations"] or section["content"] == "Not found in this document."


def test_a_model_failure_still_finishes_the_summary_and_is_logged(run_summary, api: Api) -> None:  # type: ignore[no-untyped-def]
    summary, _ = run_summary("unused", fail=LLMError(f"ReadTimeout calling model {SUMMARY_MODEL}"))
    assert summary["status"] == "ready"
    assert summary["model_id"] == "stub-orchestrator"  # review finding 6: provenance says who wrote it
    assert any(s["citations"] for s in summary["sections"])
    logs = list(api.settings.error_log_dir.glob("LLMError_*.log"))
    assert logs and all("stage:   summarize" in p.read_text() for p in logs)
    assert all(CANARY not in p.read_text() for p in logs)


def test_a_number_outside_any_citation_sends_the_field_back_to_quotes(run_summary) -> None:  # type: ignore[no-untyped-def]
    def reply(model: str, system: str, user: str) -> str:
        return cited(model, system, user) + " They also want 987,654 dollars."

    summary, _ = run_summary(reply)
    assert all("987,654" not in s["content"] for s in summary["sections"])


def test_the_stub_is_unchanged_when_the_model_is_off(api: Api) -> None:
    matter = api.create_matter()
    [document] = api.ingest(matter["id"], "acme_demand_letter_scanned.pdf")
    started = api.client.post(f"/api/v1/documents/{document}/summaries", json={"template": "letter_demand"}).json()
    api.run_jobs()
    summary = api.client.get(f"/api/v1/summaries/{started['summary_id']}").json()
    assert summary["model_id"] == "stub-orchestrator"


def test_a_long_document_is_summarized_by_the_faster_model(run_summary, api: Api) -> None:  # type: ignore[no-untyped-def]
    """DEC-14: past summary_long_pages the summary uses llm_summary_long_model (a 50-page run took 10 min on 14B)."""
    api.settings.summary_long_pages = 0
    api.settings.llm_summary_long_model = "long-m"
    summary, fake = run_summary(cited)
    assert {c["model"] for c in fake.calls} == {"long-m"}
    assert summary["model_id"] == "long-m"
