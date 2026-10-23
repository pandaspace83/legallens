from types import SimpleNamespace

from legallens.orchestrator.stub.router import summary_choice


def ctx(content: str, **options: str) -> SimpleNamespace:
    return SimpleNamespace(content=content, options=options)


def test_an_uploaded_opinion_gets_the_case_brief_template_when_the_message_names_none() -> None:
    assert summary_choice(ctx("Summarize this document"), is_law=True)[0] == "opinion"


def test_a_letter_still_gets_the_demand_letter_template() -> None:
    assert summary_choice(ctx("Summarize this document"), is_law=False)[0] == "letter_demand"


def test_the_message_or_the_lawyers_choice_beats_the_document_type() -> None:
    assert summary_choice(ctx("Summarize this complaint"), is_law=True)[0] == "pleading"
    assert summary_choice(ctx("Summarize this", summary_template="letter_demand"), is_law=True)[0] == "letter_demand"
