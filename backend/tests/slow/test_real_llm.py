"""The local models for real, through Ollama. Run with `pytest -m llm`; skipped when Ollama or a model is missing."""

import asyncio

import pytest

from legallens.config import Settings
from legallens.models.llm import OllamaChat, get_llm, local_status
from legallens.orchestrator.local import prompts, text
from legallens.search.hybrid import Hit

pytestmark = pytest.mark.llm

SETTINGS = Settings(env="test")


@pytest.fixture(scope="module")
def llm() -> OllamaChat:
    ok, detail = local_status(SETTINGS)
    if not ok:
        pytest.skip(f"Ollama is not ready: {detail}")
    model = get_llm(SETTINGS)
    assert isinstance(model, OllamaChat)
    return model


def passage(body: str, name: str = "msa.pdf", para: str = "4.2(a)") -> Hit:
    return Hit(
        chunk_id=1, document_id="doc_1", document_name=name, kind="text", seq=0, header="", section_path=None,
        clause_ref=None, para_ref=para, page_start=1, page_end=1, text=body, bbox=[], parent_chunk_id=None,
    )  # fmt: skip


def test_complete_returns_text_and_token_counts(llm: OllamaChat) -> None:
    result = asyncio.run(
        llm.complete(
            SETTINGS.llm_rewrite_model, "Answer in one word.", "What colour is a clear daytime sky?", max_tokens=16
        )
    )
    assert result.text.strip()
    assert result.tokens_in > 0 and result.tokens_out > 0
    assert result.model == SETTINGS.llm_rewrite_model


def test_stream_yields_pieces_that_join_to_an_answer(llm: OllamaChat) -> None:
    async def collect() -> list[str]:
        return [
            p async for p in llm.stream(SETTINGS.llm_rewrite_model, "Answer in one word.", "Say hello.", max_tokens=16)
        ]

    pieces = asyncio.run(collect())
    assert pieces and "".join(pieces).strip()


def test_the_answer_model_cites_the_passage_and_the_checker_verifies_it(llm: OllamaChat) -> None:
    hits = [
        passage("Either party may terminate this Agreement on sixty (60) days' written notice.", para="4.2(a)"),
        passage("This Agreement is governed by the laws of California.", name="msa.pdf", para="9.1"),
    ]
    question = "How much notice is needed to terminate the agreement?"
    result = asyncio.run(
        llm.complete(
            SETTINGS.llm_answer_model, prompts.ANSWER_SYSTEM, text.build_prompt(question, hits), max_tokens=512
        )
    )
    checked = text.check_answer(result.text, hits, question)
    assert checked is not None, result.text
    assert not checked.not_found
    assert "60" in checked.text or "sixty" in checked.text.lower()
    assert checked.citations and all(c.verified for c in checked.citations)
    assert not checked.unsupported_numbers


def test_the_answer_model_says_not_found_when_the_passages_do_not_cover_it(llm: OllamaChat) -> None:
    hits = [passage("This Agreement is governed by the laws of California.", para="9.1")]
    question = "What is the late-payment interest rate?"
    result = asyncio.run(
        llm.complete(
            SETTINGS.llm_answer_model, prompts.ANSWER_SYSTEM, text.build_prompt(question, hits), max_tokens=512
        )
    )
    checked = text.check_answer(result.text, hits, question)
    # Either the explicit not-found, or no usable citation (the caller then quotes passages): never an invented rate.
    assert checked is None or checked.not_found or not checked.unsupported_numbers
