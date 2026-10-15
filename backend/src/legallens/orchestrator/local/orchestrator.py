"""ASK with a local model (WORKFLOWS_TODO W1, W2).

Everything except the wording is the stub's: the same routing, the same search, cross-encoder rerank and
"Not found" gate, the same events in the same order, and summaries and drafts still start their jobs. The local
model does two things only: rewrite a follow-up question, and write the answer from the passages. Whatever it
writes is checked against those passages before the lawyer sees it.

If the model is unreachable, answers without usable citations, or says "not found" for passages the gate
matched, the lawyer gets the quoted-passages answer instead; failures are logged to their own file
(orchestrator/errors.py). "Verified" on a citation means its quote is literal in the passage, its figures are
in the passage, and the claim shares words with it; it does not mean a model understood the clause correctly.
"""

from collections.abc import AsyncIterator

from legallens.config import Settings
from legallens.models.llm import ChatModel, LLMError, LLMResult
from legallens.orchestrator.base import (
    AnswerStateEvent,
    AnswerTextEvent,
    CitationEvent,
    OrchestratorEvent,
    RunContext,
    StatusEvent,
    TokenEvent,
    UsageEvent,
)
from legallens.orchestrator.errors import log_failure
from legallens.orchestrator.local import prompts, text
from legallens.orchestrator.stub.orchestrator import Retrieval, StubOrchestrator, outside_law_notice

ANSWER_TOKENS = 700
REWRITE_TOKENS = 150


class LocalOrchestrator(StubOrchestrator):
    name = "local"

    def __init__(self, settings: Settings, llm: ChatModel) -> None:
        super().__init__(token_delay_ms=settings.stub_token_delay_ms)
        self.settings = settings
        self.llm = llm

    # ------------------------------------------------------------ rewrite

    async def _rewrite_question(self, ctx: RunContext) -> tuple[str, int, int]:
        """(question to search, tokens in, tokens out)."""
        question = ctx.content.strip()
        history = text.format_history(ctx.history, self.settings.llm_history_turns, self.settings.llm_history_chars)
        if not history:  # nothing to resolve a follow-up against: never call the model
            return question, 0, 0
        model = self.settings.llm_rewrite_model
        try:
            result = await self.llm.complete(
                model,
                prompts.REWRITE_SYSTEM,
                f"Chat history:\n{history}\n\nQuestion to rewrite: {question}\n\nRewritten question:",
                max_tokens=REWRITE_TOKENS,
            )
        except LLMError as exc:
            log_failure(self.settings, exc, stage="rewrite", run_id=ctx.run_id, matter_id=ctx.matter_id, model=model)
            return question, 0, 0
        return text.clean_rewrite(result.text, question), result.tokens_in, result.tokens_out

    # ------------------------------------------------------------ ask

    async def _ask(self, ctx: RunContext) -> AsyncIterator[OrchestratorEvent]:
        yield StatusEvent("rewriting")
        question, rewrite_in, rewrite_out = await self._rewrite_question(ctx)
        found: Retrieval | None = None
        async for item in self._retrieve(ctx, question):
            if isinstance(item, Retrieval):
                found = item
            else:
                yield item
        assert found is not None

        yield StatusEvent("generating")
        if not found.passed:
            async for event in self._not_found(ctx, found):
                yield event
            return

        model = self.settings.llm_answer_model
        checked: text.Checked | None = None
        result: LLMResult | None = None
        streamed = False
        try:
            # The words reach the lawyer as the model writes them; the checked text replaces them at the end.
            async for piece in self.llm.stream_full(
                model,
                prompts.ANSWER_SYSTEM,
                text.build_prompt(found.question, found.reranked),
                max_tokens=ANSWER_TOKENS,
            ):
                if isinstance(piece, LLMResult):
                    result = piece
                else:
                    streamed = True
                    yield TokenEvent(piece)
            if result is not None:
                checked = text.check_answer(result.text, found.reranked, found.question)
        except LLMError as exc:
            log_failure(self.settings, exc, stage="answer", run_id=ctx.run_id, matter_id=ctx.matter_id, model=model)

        # Quoted passages instead: the model is unreachable, gave no usable citation, or said "not found" after
        # the keyword gate had already matched passages (a small model's "not found" must not hide them).
        if checked is None or checked.not_found or result is None:
            if streamed:
                yield AnswerTextEvent("")  # discard what was streamed; the passages answer instead
            async for event in self._extractive(ctx, found):
                yield event
            return

        body = (
            (outside_law_notice(ctx) if found.outside_law else "")
            + checked.text
            + await self._authority_note(ctx, [c.hit.document_id for c in checked.citations])
        )
        if body != result.text:
            yield AnswerTextEvent(body)

        yield StatusEvent("verifying")
        for c in checked.citations:
            yield CitationEvent(
                n=c.n,
                chunk_id=c.hit.chunk_id,
                document_id=c.hit.document_id,
                document_name=c.hit.document_name,
                page=c.page,
                para_ref=c.para_ref,
                quote=c.quote,
                verified=c.verified,
                bbox=c.bbox,
                score=round(c.hit.rerank_score if c.hit.rerank_score is not None else c.hit.rrf, 6),
            )
        yield found.trace
        partial = found.outside_law or checked.unsupported_numbers or any(not c.verified for c in checked.citations)
        yield AnswerStateEvent("partial" if partial else "found", found.outside_law)
        yield UsageEvent(
            result.tokens_in + rewrite_in,
            result.tokens_out + rewrite_out,
            model,
            prompts.PROMPT_VERSION,
        )
