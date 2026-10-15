"""The orchestrator interface (TA frame 4). The stub implements it now; the LangChain chain implements it later.

An orchestrator turns one chat turn into a stream of typed events. It never touches the database or HTTP
directly: it reads what it needs from RunContext and calls back into the backend through RunServices. The run
service (services/chat.py) persists what it yields and relays it to the browser as the SSE events of the API
reference, so swapping the orchestrator changes neither the API nor the stored data.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol

from legallens.search.hybrid import Hit, SearchResult

# ---------------------------------------------------------------- events an orchestrator yields


@dataclass(frozen=True)
class IntentEvent:
    intent: str  # ask | summarize | draft | refine_draft | clarify
    confidence: float


@dataclass(frozen=True)
class ScopeEvent:
    searching: str


@dataclass(frozen=True)
class StatusEvent:
    step: str  # rewriting | searching | reranking | generating | verifying


@dataclass(frozen=True)
class TokenEvent:
    delta: str


@dataclass(frozen=True)
class AnswerTextEvent:
    """The checked text, replacing everything streamed so far (empty: start over with a fallback answer)."""

    text: str


@dataclass(frozen=True)
class CitationEvent:
    n: int
    chunk_id: int
    document_id: str
    document_name: str
    page: int
    para_ref: str | None
    quote: str
    verified: bool
    bbox: list[Any] | None = None
    score: float | None = None


@dataclass(frozen=True)
class AnswerStateEvent:
    state: str  # found | partial | not_found
    outside_law: bool = False


@dataclass(frozen=True)
class JobEvent:
    job_id: str
    kind: str  # summarize | draft | regenerate
    entity_id: str


@dataclass(frozen=True)
class TraceEvent:
    """The retrieval trace (DEC-69). Stored, never streamed."""

    rewritten_query: str
    sub_queries: list[str]
    filters: dict[str, Any]
    bm25_hits: list[Any]
    vector_hits: list[Any]
    fused: list[Any]
    reranked: list[Any]
    gate_score: float | None


@dataclass(frozen=True)
class UsageEvent:
    tokens_in: int
    tokens_out: int
    model_id: str
    prompt_version: str


OrchestratorEvent = (
    IntentEvent
    | ScopeEvent
    | StatusEvent
    | TokenEvent
    | AnswerTextEvent
    | CitationEvent
    | AnswerStateEvent
    | JobEvent
    | TraceEvent
    | UsageEvent
)


# ---------------------------------------------------------------- what an orchestrator gets


@dataclass(frozen=True)
class DocumentRef:
    id: str
    filename: str
    origin: str
    pages_total: int | None


@dataclass(frozen=True)
class RefineResult:
    draft_id: str
    section_id: str
    heading: str
    version: int


class RunServices(Protocol):
    """Backend operations an orchestrator may call. Every one is already scoped to the run's matter."""

    async def search(self, query: str, document_ids: list[str] | None) -> SearchResult: ...

    async def rerank(self, query: str, hits: list[Hit], top_n: int) -> list[Hit]:
        """Cross-encoder rerank: scores every hit (Hit.rerank_score), returns the best top_n with their context."""
        ...

    async def start_summary(self, document_id: str, template: str, audience: str) -> tuple[str, str]: ...

    async def start_draft(
        self, draft_type: str, incoming_document_id: str, supporting_document_ids: list[str], instructions: str
    ) -> tuple[str, str]: ...

    async def refine_draft(self, draft_id: str, instruction: str) -> RefineResult: ...


@dataclass
class RunContext:
    run_id: str
    matter_id: str
    conversation_id: str
    user_message_id: str
    assistant_message_id: str
    content: str
    mode: str
    scope_kind: str
    scope_document_ids: list[str] | None
    scope_label: str
    options: dict[str, Any]
    history: list[dict[str, str]]  # oldest first: {"role", "content"}; the last 6 turns
    matter: dict[str, Any]  # name, client_name, our_side, jurisdiction, profile
    documents: list[DocumentRef]  # ready documents in the matter
    services: RunServices
    settings: Any = field(repr=False, default=None)


class Orchestrator(Protocol):
    name: str

    def run(self, ctx: RunContext) -> AsyncIterator[OrchestratorEvent]: ...
