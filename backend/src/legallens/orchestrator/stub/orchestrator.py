"""Stub orchestrator: deterministic stand-in for the LangChain chain, with the same events in the same order.

Ask runs the real hybrid search and answers only from what it finds (DEC-21): the answer quotes the best
passages verbatim with [n] markers, so every citation is checkable. It says "Not found in your documents" when
the gate fails (DEC-37) and flags questions that need outside law (DEC-38). No model is involved.
"""

import asyncio
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from legallens.orchestrator.base import (
    AnswerStateEvent,
    CitationEvent,
    IntentEvent,
    JobEvent,
    OrchestratorEvent,
    RunContext,
    ScopeEvent,
    StatusEvent,
    TokenEvent,
    TraceEvent,
    UsageEvent,
)
from legallens.orchestrator.stub.router import draft_type_choice, route, summary_choice
from legallens.search.fts import content_terms
from legallens.search.hybrid import Hit
from legallens.search.pinpoint import pinpoint
from legallens.search.scope import display_name
from legallens.search.sentences import best_sentence

MODEL_ID = "stub-orchestrator"
PROMPT_VERSION = "stub-0"
PASSAGES_TO_MODEL = 8
PASSAGES_QUOTED = 3
GATE_THRESHOLD = 0.34

TEMPLATE_TITLES = {"letter_demand": "Letter or demand", "pleading": "Complaint or pleading", "opinion": "Court opinion"}
AUDIENCE_TITLES = {"one_paragraph": "one paragraph", "detailed": "detailed digest", "plain_english": "plain English"}

_OUTSIDE_LAW = re.compile(
    r"\b(enforceab\w*|enforce(d|s)?\b|valid under|legal(ly)? under|under (the )?(\w+\s){0,2}law|"
    r"statute of limitations|case law|precedent|is (it|this|that) (legal|lawful)|unlawful|still good law)",
    re.I,
)
_FOLLOW_UP = re.compile(r"^\s*(and|also|what about|how about|plus|then|but)\b", re.I)
_PRONOUN = re.compile(r"\b(it|its|that|this|those|these|they|them|there)\b", re.I)
_WORDS = re.compile(r"\S+\s*")


def _stem(word: str) -> str:
    return word[:6] if len(word) > 6 else word


def _covers(text: str, term: str) -> bool:
    return _stem(term) in text.lower()


def _normalise(text: str) -> str:
    return " ".join(text.split()).lower()


def _where(hit: Hit, page: int, para_ref: str | None) -> str:
    where = f"p. {page}" + (f", {para_ref}" if para_ref else "")
    return f"{display_name(hit.document_name)}, {where}"


def reranker_gate(top: float, keyword_share: float, settings: Any) -> bool:
    """The reranker's top score decides; a clear keyword match rescues a low but non-zero score."""
    return top >= settings.gate_rerank_min or (
        keyword_share >= settings.gate_rescue_keyword and top >= settings.gate_rescue_rerank
    )


@dataclass
class Retrieval:
    """What the search, rerank and gate steps found for one question."""

    question: str
    terms: list[str]
    outside_law: bool
    reranked: list[Hit]
    gate_score: float
    trace: TraceEvent
    passed: bool


def outside_law_notice(ctx: RunContext) -> str:
    where = ctx.matter.get("jurisdiction") or "the governing"
    return (
        f"Your documents show what they say, but not whether {where} law would enforce it. LegalLens answers "
        "only from your documents. If you have the relevant statute or case, upload it to this matter.\n\n"
    )


class StubOrchestrator:
    name = "stub"

    def __init__(self, token_delay_ms: int = 25) -> None:
        self.token_delay = token_delay_ms / 1000

    async def _stream(self, text: str) -> AsyncIterator[TokenEvent]:
        for piece in _WORDS.findall(text):
            if self.token_delay:
                await asyncio.sleep(self.token_delay)
            yield TokenEvent(piece)

    async def run(self, ctx: RunContext) -> AsyncIterator[OrchestratorEvent]:
        decision = route(ctx)
        yield IntentEvent(decision.intent, decision.confidence)
        yield ScopeEvent(ctx.scope_label)
        if decision.intent == "ask":
            async for event in self._ask(ctx):
                yield event
        elif decision.intent == "summarize" and decision.document:
            template, audience = summary_choice(ctx)
            summary_id, job_id = await ctx.services.start_summary(decision.document.id, template, audience)
            text = (
                f"Summarizing {display_name(decision.document.filename)} with the "
                f"{TEMPLATE_TITLES[template]} template ({AUDIENCE_TITLES[audience]}). It runs in the background, "
                "and the summary opens when it's ready."
            )
            async for event in self._stream(text):
                yield event
            yield JobEvent(job_id, "summarize", summary_id)
            yield UsageEvent(len(ctx.content.split()), len(text.split()), MODEL_ID, PROMPT_VERSION)
        elif decision.intent == "draft" and decision.document:
            incoming = decision.document
            draft_type = draft_type_choice(ctx)
            # Facts come from the supporting documents. With none named and the whole matter in scope, use the
            # client's own documents (then any other ready document): a draft with no facts is all placeholders.
            supporting = ctx.options.get("supporting_document_ids") or [
                d for d in (ctx.scope_document_ids or []) if d != incoming.id
            ]
            if not supporting:
                others = [d for d in ctx.documents if d.id != incoming.id]
                supporting = [d.id for d in others if d.origin != "other_party"] or [d.id for d in others]
            draft_id, job_id = await ctx.services.start_draft(draft_type, incoming.id, supporting, ctx.content)
            kind = "memo" if draft_type == "memo" else "response letter"
            text = (
                f"Drafting a {kind} to {display_name(incoming.filename)}. I'll list each point it makes and check "
                "the draft answers every one. The draft opens in the editor when it's ready, marked "
                '"AI draft · not reviewed".'
            )
            async for event in self._stream(text):
                yield event
            yield JobEvent(job_id, "draft", draft_id)
            yield UsageEvent(len(ctx.content.split()), len(text.split()), MODEL_ID, PROMPT_VERSION)
        elif decision.intent == "refine_draft":
            result = await ctx.services.refine_draft(ctx.options["draft_id"], ctx.content)
            text = (
                f'I updated the section "{result.heading}" and saved it as version {result.version}. '
                "Review the change in the draft before you rely on it."
            )
            async for event in self._stream(text):
                yield event
            yield UsageEvent(len(ctx.content.split()), len(text.split()), MODEL_ID, PROMPT_VERSION)
        else:
            text = decision.question or (
                "I can answer questions from this matter's documents, summarize a document, or draft a response "
                "for you to review. What would you like to do?"
            )
            async for event in self._stream(text):
                yield event
            yield UsageEvent(len(ctx.content.split()), len(text.split()), MODEL_ID, PROMPT_VERSION)

    def _rewrite(self, ctx: RunContext) -> str:
        question = ctx.content.strip()
        previous = next((t["content"] for t in reversed(ctx.history) if t["role"] == "user"), None)
        follow_up = _FOLLOW_UP.match(question) or (_PRONOUN.search(question) and len(content_terms(question)) <= 3)
        if previous and follow_up:
            return f"{previous.strip()} {question}"
        return question

    async def _ask(self, ctx: RunContext) -> AsyncIterator[OrchestratorEvent]:
        yield StatusEvent("rewriting")
        question = self._rewrite(ctx)
        found: Retrieval | None = None
        async for item in self._retrieve(ctx, question):
            if isinstance(item, Retrieval):
                found = item
            else:
                yield item
        assert found is not None
        yield StatusEvent("generating")
        generator = self._not_found(ctx, found) if not found.passed else self._extractive(ctx, found)
        async for event in generator:
            yield event

    async def _retrieve(self, ctx: RunContext, question: str) -> AsyncIterator[OrchestratorEvent | Retrieval]:
        """Search, rerank and gate. Yields status events, then one Retrieval as the last item."""
        terms = content_terms(question)
        outside_law = bool(_OUTSIDE_LAW.search(ctx.content))

        yield StatusEvent("searching")
        result = await ctx.services.search(question, ctx.scope_document_ids)

        yield StatusEvent("reranking")
        reranked = await ctx.services.rerank(
            question, result.hits, getattr(ctx.settings, "rerank_top_n", PASSAGES_TO_MODEL)
        )
        best = reranked[0] if reranked else None
        # Gate: the best share of the question's words found in any passage that matched on keywords.
        keyword_hits = [h for h in reranked if h.bm25_rank is not None]
        gate_score = (
            max(sum(_covers(h.text, t) for t in terms) / len(terms) for h in keyword_hits)
            if keyword_hits and terms
            else 0.0
        )
        # With the reranker on, its score decides (it reads the question and the passage together); the keyword
        # share rescues a low-scoring but clearly matching passage. Without it, the keyword share alone.
        scored = [h.rerank_score for h in reranked if h.rerank_score is not None]
        settings = ctx.settings
        if scored and getattr(settings, "reranker", "none") == "bge":
            top = max(scored)
            gate_passed = best is not None and reranker_gate(top, gate_score, settings)
            gate_score = top
        else:
            gate_passed = best is not None and gate_score >= GATE_THRESHOLD
        trace = TraceEvent(
            rewritten_query=question,
            sub_queries=[question],
            filters={"matter_id": ctx.matter_id, "document_ids": ctx.scope_document_ids, "fts_query": result.fts_query},
            bm25_hits=[[cid, round(score, 4)] for cid, score in result.bm25],
            vector_hits=[[cid, round(dist, 4)] for cid, dist in result.vector],
            fused=[h.trace() for h in result.hits],
            reranked=[h.chunk_id for h in reranked],
            gate_score=round(gate_score, 4),
        )
        yield Retrieval(
            question=question,
            terms=terms,
            outside_law=outside_law,
            reranked=reranked,
            gate_score=gate_score,
            trace=trace,
            passed=gate_passed,
        )

    async def _not_found(self, ctx: RunContext, r: Retrieval) -> AsyncIterator[OrchestratorEvent]:
        """The fixed "Not found" answer (DEC-37). Never sent to a model."""
        if not ctx.documents:
            text = "Not found in your documents. No documents in this matter are ready yet; upload one and ask again."
        else:
            label = ctx.scope_label
            label = label[0].lower() + label[1:] if label.startswith("All ") else label
            text = f"Not found in your documents. I searched {label}"
            text += f" for: {', '.join(r.terms[:8])}." if r.terms else "."
        if r.outside_law:
            text += (
                " This question also needs law from outside your documents. LegalLens answers only from the "
                "documents in this matter. If you have the relevant statute or case, upload it and ask again."
            )
        async for event in self._stream(text):
            yield event
        yield r.trace
        yield AnswerStateEvent("not_found", r.outside_law)
        yield UsageEvent(len(r.question.split()), len(text.split()), MODEL_ID, PROMPT_VERSION)

    async def _authority_note(self, ctx: RunContext, document_ids: list[str]) -> str:
        """FR-ASK-04: an answer that rests on uploaded law says its later history was not checked."""
        from legallens.drafting.checks import AUTHORITY_NOTE

        found = await ctx.services.authority_documents(sorted(set(document_ids)))
        if not found:
            return ""
        names = ", ".join(display_name(name) for name in found.values())
        return "\n\n" + AUTHORITY_NOTE.format(names=names)

    async def _extractive(self, ctx: RunContext, r: Retrieval) -> AsyncIterator[OrchestratorEvent]:
        """The answer made of verbatim quotes with [n] markers: no model involved."""
        terms, outside_law, reranked = r.terms, r.outside_law, r.reranked
        quoted: list[tuple[int, Hit, str]] = []
        for hit in reranked:
            if len(quoted) >= PASSAGES_QUOTED:
                break
            if hit.bm25_rank is None or not any(_covers(hit.text, t) for t in terms):
                continue
            quote = best_sentence(hit.text, terms, boost=content_terms(ctx.content))
            if any(_normalise(quote) == _normalise(q) for _, _, q in quoted):
                continue
            quoted.append((len(quoted) + 1, hit, quote))

        covered = {t for t in terms if any(_covers(h.text, t) for _, h, _ in quoted)}
        missing = [t for t in terms if t not in covered]
        partial = outside_law or (len(missing) / max(len(terms), 1) > 0.34)

        parts: list[str] = []
        if outside_law:
            parts.append(outside_law_notice(ctx))
        parts.append("From your documents:\n\n")
        located = {n: pinpoint(hit.text, hit.bbox, quote, hit.page_start, hit.para_ref) for n, hit, quote in quoted}
        for n, hit, quote in quoted:
            page, para_ref, _ = located[n]
            parts.append(f"- {_where(hit, page, para_ref)}: “{quote}” [{n}]\n")
        if missing and not outside_law:
            parts.append(f"\nNot found in your documents: {', '.join(missing[:6])}.")
        text = "".join(parts).rstrip() + await self._authority_note(ctx, [h.document_id for _, h, _ in quoted])
        async for event in self._stream(text):
            yield event

        yield StatusEvent("verifying")
        for n, hit, quote in quoted:
            verified = _normalise(quote) in _normalise(hit.text)
            yield CitationEvent(
                n=n,
                chunk_id=hit.chunk_id,
                document_id=hit.document_id,
                document_name=hit.document_name,
                page=located[n][0],
                para_ref=located[n][1],
                quote=quote,
                verified=verified,
                bbox=located[n][2],
                score=round(hit.rrf, 6),
            )
        yield r.trace
        yield AnswerStateEvent("partial" if partial else "found", outside_law)
        tokens_in = len(r.question.split()) + sum(len(h.text.split()) for h in reranked)
        yield UsageEvent(tokens_in, len(text.split()), MODEL_ID, PROMPT_VERSION)
