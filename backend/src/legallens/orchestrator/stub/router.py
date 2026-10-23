"""Stub intent router: the prompt-bar mode if one is set, otherwise keyword rules (TA frame 4).

The LangChain router replaces this with one structured-output call at temperature 0. Like the real router, it
reads only the message, the recent turns and the matter, never document text (DEC-25).
"""

import re
from dataclasses import dataclass

from legallens.orchestrator.base import DocumentRef, RunContext
from legallens.search.fts import content_terms
from legallens.search.scope import display_name

CONFIDENCE_FLOOR = 0.70

_SUMMARIZE = re.compile(r"\b(summari[sz]e|summary|digest|brief me on|key points of)\b", re.I)
_DRAFT = re.compile(
    r"\b(draft|write|prepare)\b.{0,60}\b(response|reply|letter|memo|answer)\b|\b(respond|reply)\s+to\b", re.I
)
_MEMO = re.compile(r"\bmemo(randum)?\b", re.I)


@dataclass(frozen=True)
class Route:
    intent: str
    confidence: float
    document: DocumentRef | None = None
    question: str | None = None


def find_named_document(ctx: RunContext) -> DocumentRef | None:
    text = ctx.content.lower()
    matches = [d for d in ctx.documents if display_name(d.filename).lower() in text or d.filename.lower() in text]
    return max(matches, key=lambda d: len(d.filename)) if matches else None


def target_document(ctx: RunContext, *, prefer_other_party: bool = False) -> DocumentRef | None:
    by_id = {d.id: d for d in ctx.documents}
    explicit = ctx.options.get("incoming_document_id")
    if explicit and explicit in by_id:
        return by_id[explicit]
    named = find_named_document(ctx)
    if named:
        return named
    if ctx.scope_document_ids and len(ctx.scope_document_ids) == 1 and ctx.scope_document_ids[0] in by_id:
        return by_id[ctx.scope_document_ids[0]]
    if prefer_other_party:
        theirs = [d for d in ctx.documents if d.origin == "other_party"]
        if len(theirs) == 1:
            return theirs[0]
    if len(ctx.documents) == 1:
        return ctx.documents[0]
    return None


def _which_document_question(ctx: RunContext, verb: str) -> str:
    names = ", ".join(display_name(d.filename) for d in ctx.documents[:8]) or "none are ready yet"
    return f"Which document should I {verb}? Name it in your message or pick it as the scope. Documents: {names}."


def route(ctx: RunContext) -> Route:
    mode = ctx.mode
    if ctx.options.get("draft_id") and mode in ("auto", "draft"):
        return Route("refine_draft", 0.95)
    if mode == "ask":
        return Route("ask", 1.0)
    if mode == "summarize":
        intent, confidence = "summarize", 1.0
    elif mode == "draft":
        intent, confidence = "draft", 1.0
    elif _DRAFT.search(ctx.content):
        intent, confidence = "draft", 0.85
    elif _SUMMARIZE.search(ctx.content):
        intent, confidence = "summarize", 0.9
    elif not content_terms(ctx.content):
        return Route("clarify", 0.3, question="What would you like to know about this matter's documents?")
    else:
        return Route("ask", 0.8)

    if confidence < CONFIDENCE_FLOOR:
        return Route("clarify", confidence, question="Do you want an answer, a summary or a draft?")
    document = target_document(ctx, prefer_other_party=(intent == "draft"))
    if document is None:
        verb = "summarize" if intent == "summarize" else "respond to"
        return Route("clarify", confidence, question=_which_document_question(ctx, verb))
    return Route(intent, confidence, document=document)


def summary_choice(ctx: RunContext, is_law: bool = False) -> tuple[str, str]:
    """is_law: the document is an uploaded court opinion or statute, so the case-brief template fits when the
    message names no template."""
    text = ctx.content.lower()
    template = ctx.options.get("summary_template") or (
        "pleading"
        if re.search(r"\b(complaint|pleading|petition)\b", text)
        else "opinion"
        if re.search(r"\b(opinion|case brief|judgment|ruling)\b", text)
        else "opinion"
        if is_law
        else "letter_demand"
    )
    audience = ctx.options.get("audience") or (
        "plain_english"
        if re.search(r"\b(plain english|for the client|client-friendly|simple)\b", text)
        else "one_paragraph"
        if re.search(r"\b(one paragraph|short|brief|quick)\b", text)
        else "detailed"
    )
    return template, audience


def draft_type_choice(ctx: RunContext) -> str:
    return ctx.options.get("draft_type") or ("memo" if _MEMO.search(ctx.content) else "response_letter")
