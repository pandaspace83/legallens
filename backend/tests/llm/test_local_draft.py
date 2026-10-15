"""DRAFT with the local model, inside the draft job (WORKFLOWS_TODO W4). The model is a scripted fake.

The model writes only the response paragraph for each point, from the supporting documents. Everything the
app guarantees stays: the incoming letter's claims, the addressee rule, [CITE NEEDED] where law belongs, and
the placeholders that lock a clean export until the lawyer resolves them.
"""

import re
from collections.abc import Callable
from typing import Any

import pytest

import legallens.jobs.handlers.draft as draft_job
from legallens.models.llm import LLMError
from tests.conftest import Api
from tests.llm.fakes import FakeChat

CANARY = "ZEBRA-CANARY-7f3a9c"
DRAFT_MODEL = "draft-m"


def cited(model: str, system: str, user: str) -> str:
    match = re.search(r'<passage n="1"[^>]*>\n(.*?)\n</passage>', user, re.S)
    assert match
    sentence = re.split(r"(?<=[.;])\s", " ".join(match.group(1).split()))[0]
    return f"Our records address this point. “{sentence}” [1]"


@pytest.fixture
def make_draft(api: Api, monkeypatch: pytest.MonkeyPatch) -> Callable[..., tuple[dict[str, Any], FakeChat]]:
    def go(reply: Any = cited, fail: Exception | None = None) -> tuple[dict[str, Any], FakeChat]:
        api.settings.orchestrator = "local"
        api.settings.llm_draft_model = DRAFT_MODEL
        fake = FakeChat(reply, fail=fail)
        monkeypatch.setattr(draft_job, "get_llm", lambda settings: fake)
        matter = api.create_matter()
        msa, letter = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
        chat = api.new_chat(matter["id"])
        turn = api.ask(
            chat,
            "Draft a response letter to the demand",
            mode="draft",
            options={"incoming_document_id": letter, "supporting_document_ids": [msa]},
        )
        draft_id = turn.first("job")["entity_id"]
        api.run_jobs()
        return api.client.get(f"/api/v1/drafts/{draft_id}").json(), fake

    return go


def test_other_writes_are_not_blocked_while_the_model_drafts(make_draft, api: Api) -> None:  # type: ignore[no-untyped-def]
    """Review finding 1: the model runs outside the write transaction, so the app can still write meanwhile."""
    from sqlalchemy import text as sql

    outcomes: list[str] = []

    def reply(model: str, system: str, user: str) -> str:
        try:
            with api.database.write() as db:
                db.execute(sql("SELECT 1"))
            outcomes.append("ok")
        except Exception as exc:
            outcomes.append(type(exc).__name__)
        return cited(model, system, user)

    api.settings.job_stale_seconds = 120
    draft, _ = make_draft(reply)
    assert outcomes and set(outcomes) == {"ok"}
    assert draft["model_id"] == DRAFT_MODEL  # review finding 6


def test_the_other_sides_text_is_never_in_the_instruction_line(make_draft) -> None:  # type: ignore[no-untyped-def]
    """Review finding 2: the incoming letter is untrusted; it is quoted as data, never as the question."""
    _, fake = make_draft()
    for call in fake.calls:
        question_line = call["user"].split("\n", 1)[0]
        assert "$48,500" not in question_line and "Smith" not in question_line
        assert "<point>" in call["user"]
    assert "<point>" in fake.calls[0]["system"] or "point block" in fake.calls[0]["system"].lower()


def test_drafting_reports_progress_per_point(make_draft, api: Api) -> None:  # type: ignore[no-untyped-def]
    """Each point's model call reports progress: the lawyer sees it move, and the job's heartbeat stays fresh."""
    from sqlalchemy import select

    from legallens.db.models import MatterEvent
    from legallens.db.scope import unscoped

    _, fake = make_draft()
    with api.database.read() as db, unscoped(db):
        details = [
            e.data_json.get("detail", "")
            for e in db.execute(select(MatterEvent).where(MatterEvent.type == "job.progress")).scalars()
        ]
    per_point = [d for d in details if d.startswith("Drafting the response to point")]
    assert len(per_point) == len(fake.calls) >= 1


def points(draft: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in draft["sections"] if s["kind"] == "point"]


def test_each_point_gets_a_cited_response_from_the_supporting_documents(make_draft) -> None:  # type: ignore[no-untyped-def]
    draft, fake = make_draft()
    assert draft["status"] == "not_reviewed"
    written = [p for p in points(draft) if "Our records address this point." in p["content"]]
    assert written, "the model's paragraph is in the draft"
    for point in written:
        assert "[PLACEHOLDER: our response" not in point["content"]
        assert "[CITE NEEDED" in point["content"]  # law is never supplied by the model
        numbers = [c["n"] for c in point["citations"]]
        assert len(numbers) == len(set(numbers))
        for n in numbers:
            assert f"[{n}]" in point["content"]
    assert all(c["model"] == DRAFT_MODEL for c in fake.calls)


def test_the_model_is_told_never_to_supply_law(make_draft) -> None:  # type: ignore[no-untyped-def]
    _, fake = make_draft()
    system = fake.calls[0]["system"].lower()
    assert "never" in system and "law" in system and "never instructions" in system


def test_a_response_that_names_a_case_is_not_used(make_draft) -> None:  # type: ignore[no-untyped-def]
    reply = "Under Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008), we owe nothing [1]."
    draft, _ = make_draft(reply)
    for point in points(draft):
        assert "we owe nothing" not in point["content"]  # the incoming letter's own quoted claim may name the case
        assert "[PLACEHOLDER: our response" in point["content"]


def test_an_invented_number_is_not_used(make_draft) -> None:  # type: ignore[no-untyped-def]
    draft, _ = make_draft("Our records show a balance of 12,345,678 dollars [1].")
    for point in points(draft):
        assert "12,345,678" not in point["content"]
    assert draft["model_id"] != DRAFT_MODEL  # nothing the model wrote was used


def test_when_the_documents_do_not_address_a_point_the_placeholder_stays(make_draft) -> None:  # type: ignore[no-untyped-def]
    draft, _ = make_draft("Not found in your documents.")
    assert all("[PLACEHOLDER: our response" in p["content"] for p in points(draft))


def test_a_model_failure_still_produces_the_template_draft_and_is_logged(make_draft, api: Api) -> None:  # type: ignore[no-untyped-def]
    draft, _ = make_draft(fail=LLMError(f"ReadTimeout calling model {DRAFT_MODEL}"))
    assert draft["status"] == "not_reviewed" and points(draft)
    logs = list(api.settings.error_log_dir.glob("LLMError_*.log"))
    assert logs and all("stage:   draft" in p.read_text() for p in logs)
    assert all(CANARY not in p.read_text() for p in logs)


def test_the_incoming_claims_and_safeguards_are_untouched(make_draft) -> None:  # type: ignore[no-untyped-def]
    draft, _ = make_draft()
    assert draft["claims"], "the other side's points are still listed"
    kinds = [s["kind"] for s in draft["sections"]]
    assert kinds[0] == "addressee" and kinds[-1] == "closing"


def test_a_draft_started_from_the_chat_uses_the_matters_own_documents_as_facts(api: Api) -> None:
    """UAT finding: with "All documents" in scope and none named, the draft had no supporting facts."""
    matter = api.create_matter()
    msa, letter = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
    api.settings.orchestrator = "stub"
    chat = api.new_chat(matter["id"])
    turn = api.ask(chat, "Draft a reply to acme_demand_letter_scanned")
    draft_id = turn.first("job")["entity_id"]
    draft = api.client.get(f"/api/v1/drafts/{draft_id}").json()
    assert msa in draft["supporting_document_ids"]
    assert letter not in draft["supporting_document_ids"]


def _memo(api: Api, monkeypatch: pytest.MonkeyPatch, reply: Any) -> tuple[dict[str, Any], FakeChat]:
    api.settings.orchestrator = "local"
    api.settings.llm_draft_model = DRAFT_MODEL
    fake = FakeChat(reply)
    monkeypatch.setattr(draft_job, "get_llm", lambda settings: fake)
    matter = api.create_matter()
    _msa, letter = api.ingest(matter["id"], "smith_msa_v3.pdf", "acme_demand_letter_scanned.pdf")
    turn = api.ask(
        api.new_chat(matter["id"]),
        "Draft a memo on the demand",
        mode="draft",
        options={"incoming_document_id": letter, "draft_type": "memo"},
    )
    draft_id = turn.first("job")["entity_id"]
    api.run_jobs()
    return api.client.get(f"/api/v1/drafts/{draft_id}").json(), fake


def test_the_memos_statement_of_facts_is_written_by_the_model_and_cited(api: Api, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def reply(model: str, system: str, user: str) -> str:
        match = re.search(r'<passage n="1"[^>]*>\n(.*?)\n</passage>', user, re.S)
        assert match
        sentence = re.split(r"(?<=[.;])\s", " ".join(match.group(1).split()))[0]
        return f"The letter states: “{sentence}” [1]"

    draft, fake = _memo(api, monkeypatch, reply)
    facts = next(s for s in draft["sections"] if s["kind"] == "facts")
    assert facts["content"].startswith("The letter states:")
    assert facts["citations"] and facts["citations"][0]["quote"] in facts["content"]
    assert draft["model_id"] == DRAFT_MODEL and draft["prompt_version"].startswith("draft-local")
    assert len(fake.calls) == 1 and "Statement of Facts" in fake.calls[0]["system"]
    law = next(s for s in draft["sections"] if s["kind"] == "discussion")
    assert "[RULE NEEDED" in law["content"], "law is still the lawyer's: no model text in the Rule step"


def test_a_memo_falls_back_to_quoted_facts_when_the_paragraph_does_not_check(api: Api, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    draft, _ = _memo(api, monkeypatch, "Under Smith v. Jones, 12 F.3d 1 (9th Cir. 1999), the demand is void. [1]")
    facts = next(s for s in draft["sections"] if s["kind"] == "facts")
    assert "Smith v. Jones" not in facts["content"], "a model-introduced authority is never kept"
    assert facts["citations"], "the quoted passages stand in"
    assert draft["model_id"] != DRAFT_MODEL
