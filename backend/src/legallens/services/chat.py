"""One chat turn (TA frame 3): save the user message, start a run, record what the orchestrator yields.

POST /messages writes the user message, an assistant message in "streaming" state and a `runs` row, then starts
the run as an asyncio task. The TurnRecorder saves citations as they arrive (each SSE `citation` event carries
the saved id) and, at the end, the answer, the retrieval trace, usage, the run status and the chat title.
"""

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any

import anyio
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.engine import Database
from legallens.db.models import (
    Conversation,
    Document,
    Draft,
    Matter,
    Message,
    MessageCitation,
    RetrievalTrace,
    Run,
)
from legallens.db.scope import set_scope, unscoped
from legallens.errors import ApiError
from legallens.ids import new_id
from legallens.models.embedder import get_embedder
from legallens.models.reranker import get_reranker
from legallens.orchestrator.base import (
    AnswerStateEvent,
    AnswerTextEvent,
    CitationEvent,
    DocumentRef,
    IntentEvent,
    JobEvent,
    OrchestratorEvent,
    RefineResult,
    RunContext,
    ScopeEvent,
    StatusEvent,
    TokenEvent,
    TraceEvent,
    UsageEvent,
)
from legallens.schemas.chat import SendMessage
from legallens.search.hybrid import Hit, SearchResult, expand, hybrid_search
from legallens.search.scope import resolve_scope
from legallens.services import audit, drafts, events, matters, summaries
from legallens.services.auth import Principal
from legallens.services.conversations import title_from
from legallens.timeutil import utcnow

HISTORY_TURNS = 6


def searched_summary(ctx: RunContext, trace: TraceEvent, state: str) -> dict[str, Any]:
    """What a turn searched (DEC-22): the scope, the rewritten question and how many passages were weighed."""
    documents = len(ctx.scope_document_ids) if ctx.scope_document_ids is not None else len(ctx.documents)
    return {
        "scope_label": ctx.scope_label,
        "rewritten_question": trace.rewritten_query,
        "documents_searched": documents,
        "passages_reviewed": len(trace.fused),
        "passages_used": 0 if state == "not_found" else len(trace.reranked),
    }


def stream_url(run_id: str) -> str:
    return f"/api/v1/runs/{run_id}/stream"


def _request_hash(body: SendMessage) -> str:
    return hashlib.sha256(body.model_dump_json().encode()).hexdigest()


def mark_interrupted_runs(database: Database) -> int:
    """At start-up: a run still marked running belonged to a process that stopped."""
    with database.write() as db, unscoped(db):
        result = db.execute(
            update(Run)
            .where(Run.status == "running")
            .values(
                status="failed", finished_at=utcnow(), error_json={"code": "interrupted", "message": "Interrupted."}
            )
        )
        db.execute(
            update(Message)
            .where(Message.status == "streaming")
            .values(status="failed", error_json={"code": "interrupted", "message": "Interrupted."})
        )
    return int(getattr(result, "rowcount", 0) or 0)


# ---------------------------------------------------------------- services the orchestrator can call


class BackendRunServices:
    """RunServices for one run. Each call opens its own short session, scoped to the run's matter."""

    def __init__(self, database: Database, settings: Settings, *, matter_id: str, user_id: str, conversation_id: str):
        self.database = database
        self.settings = settings
        self.matter_id = matter_id
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.embedder = get_embedder(settings)
        self.reranker = get_reranker(settings)

    def _search_sync(self, query: str, document_ids: list[str] | None) -> SearchResult:
        with self.database.read() as db:
            set_scope(db, self.matter_id)
            return hybrid_search(
                db,
                self.embedder,
                matter_id=self.matter_id,
                query=query,
                document_ids=document_ids,
                k_leg=self.settings.k_per_leg,
                k_fused=self.settings.k_fused,
            )

    async def search(self, query: str, document_ids: list[str] | None) -> SearchResult:
        return await anyio.to_thread.run_sync(self._search_sync, query, document_ids)

    def _rerank_sync(self, query: str, hits: list[Hit], top_n: int) -> list[Hit]:
        if not hits:
            return []
        scores = self.reranker.score(query, [f"{h.header}\n{h.text}" if h.header else h.text for h in hits])
        for hit, score in zip(hits, scores, strict=True):
            hit.rerank_score = score
        # sorted() is stable, so equal scores keep the fused (RRF) order.
        best = sorted(hits, key=lambda h: -(h.rerank_score or 0.0))[:top_n]
        with self.database.read() as db:
            set_scope(db, self.matter_id)
            expand(db, self.matter_id, best)
        return best

    async def rerank(self, query: str, hits: list[Hit], top_n: int) -> list[Hit]:
        return await anyio.to_thread.run_sync(self._rerank_sync, query, hits, top_n)

    def _authority_documents_sync(self, document_ids: list[str]) -> dict[str, str]:
        from legallens.drafting.checks import looks_like_authority

        if not document_ids:
            return {}
        with self.database.read() as db:
            set_scope(db, self.matter_id)
            docs = db.execute(select(Document).where(Document.id.in_(document_ids))).scalars().all()
            return {d.id: d.filename for d in docs if looks_like_authority(db, d)}

    async def authority_documents(self, document_ids: list[str]) -> dict[str, str]:
        return await anyio.to_thread.run_sync(self._authority_documents_sync, document_ids)

    def _start_summary_sync(self, document_id: str, template: str, audience: str) -> tuple[str, str]:
        with self.database.write() as db:
            set_scope(db, self.matter_id)
            document = db.get(Document, document_id)
            if document is None:
                raise ApiError(404, "not_found", "Document not found.")
            summary, job_id = summaries.start(
                db,
                user_id=self.user_id,
                document=document,
                template=template,
                audience=audience,
                conversation_id=self.conversation_id,
            )
            return summary.id, job_id

    async def start_summary(self, document_id: str, template: str, audience: str) -> tuple[str, str]:
        return await anyio.to_thread.run_sync(self._start_summary_sync, document_id, template, audience)

    def _start_draft_sync(
        self, draft_type: str, incoming_document_id: str, supporting_document_ids: list[str], instructions: str
    ) -> tuple[str, str]:
        with self.database.write() as db:
            set_scope(db, self.matter_id)
            matter = db.get(Matter, self.matter_id)
            incoming = db.get(Document, incoming_document_id)
            if matter is None or incoming is None:
                raise ApiError(404, "not_found", "Document not found.")
            supporting = [
                d.id
                for d in db.execute(
                    select(Document).where(Document.id.in_(supporting_document_ids), Document.status == "ready")
                ).scalars()
            ]
            draft, job_id = drafts.start(
                db,
                user_id=self.user_id,
                matter=matter,
                draft_type=draft_type,
                incoming=incoming,
                supporting_ids=supporting,
                instructions=instructions,
                conversation_id=self.conversation_id,
            )
            return draft.id, job_id

    async def start_draft(
        self, draft_type: str, incoming_document_id: str, supporting_document_ids: list[str], instructions: str
    ) -> tuple[str, str]:
        return await anyio.to_thread.run_sync(
            self._start_draft_sync, draft_type, incoming_document_id, supporting_document_ids, instructions
        )

    def _refine_sync(self, draft_id: str, instruction: str) -> RefineResult:
        with self.database.write() as db:
            set_scope(db, self.matter_id)
            draft = db.get(Draft, draft_id)
            if draft is None:
                raise ApiError(404, "not_found", "Draft not found.")
            return drafts.refine_from_chat(db, self.user_id, draft, instruction)

    async def refine_draft(self, draft_id: str, instruction: str) -> RefineResult:
        return await anyio.to_thread.run_sync(self._refine_sync, draft_id, instruction)


# ---------------------------------------------------------------- creating a turn


@dataclass
class TurnStarted:
    message_id: str
    run_id: str
    ctx: RunContext | None  # None when an Idempotency-Key replay found the original turn


def _check_option_documents(db: Session, body: SendMessage) -> None:
    options = body.options
    if options is None:
        return
    wanted = [d for d in [options.incoming_document_id, *options.supporting_document_ids] if d]
    if wanted:
        found = set(db.execute(select(Document.id).where(Document.id.in_(wanted))).scalars())
        missing = [d for d in wanted if d not in found]
        if missing:
            raise ApiError(422, "invalid_option", "Some documents are not in this matter.", document_ids=missing)
    if options.draft_id and db.get(Draft, options.draft_id) is None:
        raise ApiError(422, "invalid_option", "That draft is not in this matter.")


def create_turn(
    db: Session,
    database: Database,
    settings: Settings,
    me: Principal,
    matter: Matter,
    conversation: Conversation,
    body: SendMessage,
    idempotency_key: str,
) -> TurnStarted:
    request_hash = _request_hash(body)
    existing = db.execute(
        select(Message).where(
            Message.conversation_id == conversation.id,
            Message.idempotency_key == idempotency_key,
            Message.role == "user",
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.request_hash != request_hash:
            raise ApiError(
                409, "idempotency_conflict", "This Idempotency-Key was already used for a different message."
            )
        return TurnStarted(existing.id, existing.run_id or "", None)

    active = db.execute(select(Run.id).where(Run.conversation_id == conversation.id, Run.status == "running")).first()
    if active:
        raise ApiError(409, "run_in_progress", "Wait for the current answer to finish, or stop it first.")

    resolved = resolve_scope(db, matter.id, body.scope)
    _check_option_documents(db, body)
    now = utcnow()
    run_id = new_id("run")
    user_message = Message(
        id=new_id("message"),
        matter_id=matter.id,
        conversation_id=conversation.id,
        role="user",
        content=body.content,
        mode=body.mode,
        scope_json=body.scope.model_dump(),
        scope_label=resolved.label,
        run_id=run_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        created_at=now,
    )
    assistant_message = Message(
        id=new_id("message"),
        matter_id=matter.id,
        conversation_id=conversation.id,
        role="assistant",
        content="",
        status="streaming",
        mode=body.mode,
        scope_json=body.scope.model_dump(),
        scope_label=resolved.label,
        run_id=run_id,
        created_at=utcnow(),
    )
    db.add_all([user_message, assistant_message])
    db.flush()
    db.add(
        Run(
            id=run_id,
            matter_id=matter.id,
            conversation_id=conversation.id,
            user_message_id=user_message.id,
            assistant_message_id=assistant_message.id,
            mode=body.mode,
            status="running",
        )
    )
    conversation.scope_json = body.scope.model_dump()
    conversation.updated_at = now
    matters.touch(matter)
    audit.append(
        db,
        action="ask",
        entity_type="message",
        entity_id=user_message.id,
        user_id=me.user.id,
        matter_id=matter.id,
        details={"conversation_id": conversation.id, "run_id": run_id, "mode": body.mode, "scope": resolved.kind},
    )

    previous = list(
        db.execute(
            select(Message.role, Message.content)
            .where(
                Message.conversation_id == conversation.id,
                Message.id.not_in([user_message.id, assistant_message.id]),
                Message.status == "complete",
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(HISTORY_TURNS * 2)
        ).all()
    )
    history = [{"role": role, "content": content} for role, content in reversed(previous)]
    all_ready = resolve_scope(db, matter.id, body.scope.model_copy(update={"kind": "all", "document_ids": []}))
    ctx = RunContext(
        run_id=run_id,
        matter_id=matter.id,
        conversation_id=conversation.id,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
        content=body.content,
        mode=body.mode,
        scope_kind=resolved.kind,
        scope_document_ids=resolved.document_ids,
        scope_label=resolved.label,
        options=body.options.model_dump() if body.options else {},
        history=history,
        matter={
            "name": matter.name,
            "client_name": matter.client_name,
            "our_side": matter.our_side,
            "jurisdiction": matter.jurisdiction,
            "profile": matter.profile_json,
        },
        documents=[DocumentRef(d.id, d.filename, d.origin, d.pages_total) for d in all_ready.documents],
        services=BackendRunServices(
            database, settings, matter_id=matter.id, user_id=me.user.id, conversation_id=conversation.id
        ),
        settings=settings,
    )
    return TurnStarted(user_message.id, run_id, ctx)


# ---------------------------------------------------------------- recording a run


class TurnRecorder:
    """Turns orchestrator events into stored rows and public SSE events."""

    def __init__(self, database: Database, ctx: RunContext) -> None:
        self.database = database
        self.ctx = ctx
        self.started = time.perf_counter()
        self.parts: list[str] = []
        self.intent: str | None = None
        self.answer_state: str | None = None
        self.outside_law = False
        self.job_id: str | None = None
        self.job: dict[str, str] | None = None
        self.searched: dict[str, Any] | None = None
        self.trace: TraceEvent | None = None
        self.usage: UsageEvent | None = None

    def _insert_citation(self, event: CitationEvent) -> int:
        with self.database.write() as db:
            set_scope(db, self.ctx.matter_id)
            row = MessageCitation(
                matter_id=self.ctx.matter_id,
                message_id=self.ctx.assistant_message_id,
                chunk_id=event.chunk_id,
                document_id=event.document_id,
                n=event.n,
                page=event.page,
                para_ref=event.para_ref,
                quote=event.quote,
                bbox_json=event.bbox,
                verified=event.verified,
                rerank_score=event.score,
            )
            db.add(row)
            db.flush()
            return row.id

    async def handle(self, event: OrchestratorEvent) -> list[tuple[str, dict[str, Any]]]:
        match event:
            case IntentEvent(intent, confidence):
                self.intent = intent
                return [("intent", {"intent": intent, "confidence": round(confidence, 2)})]
            case ScopeEvent(searching):
                return [("scope", {"searching": searching})]
            case StatusEvent(step):
                return [("status", {"step": step})]
            case TokenEvent(delta):
                self.parts.append(delta)
                return [("token", {"delta": delta})]
            case AnswerTextEvent(text):
                self.parts = [text] if text else []
                return [("answer_text", {"text": text})]
            case CitationEvent():
                citation_id = await anyio.to_thread.run_sync(self._insert_citation, event)
                return [
                    (
                        "citation",
                        {
                            "n": event.n,
                            "citation_id": citation_id,
                            "document": event.document_name,
                            "document_id": event.document_id,
                            "page": event.page,
                            "para": event.para_ref,
                            "quote": event.quote,
                            "verified": event.verified,
                        },
                    )
                ]
            case AnswerStateEvent(state, outside_law):
                self.answer_state, self.outside_law = state, outside_law
                # The orchestrator yields the trace before the answer state, so the summary is ready here.
                self.searched = searched_summary(self.ctx, self.trace, state) if self.trace else None
                return [("answer_state", {"state": state, "outside_law": outside_law, "searched": self.searched})]
            case JobEvent(job_id, kind, entity_id):
                self.job_id = job_id
                self.job = {"kind": kind, "entity_id": entity_id}
                return [("job", {"job_id": job_id, "kind": kind, "entity_id": entity_id})]
            case TraceEvent():
                self.trace = event
                return []
            case UsageEvent():
                self.usage = event
                return []
        return []

    def _finish_sync(self, status: str, error: dict[str, Any] | None) -> dict[str, Any]:
        latency_ms = int((time.perf_counter() - self.started) * 1000)
        ctx = self.ctx
        with self.database.write() as db:
            set_scope(db, ctx.matter_id)
            message = db.get(Message, ctx.assistant_message_id)
            run = db.get(Run, ctx.run_id)
            conversation = db.get(Conversation, ctx.conversation_id)
            if message is None or run is None or conversation is None:
                return {"message_id": ctx.assistant_message_id}  # the chat or matter was deleted meanwhile
            message.content = "".join(self.parts)
            message.status = status
            message.intent = self.intent
            message.answer_state = self.answer_state
            message.outside_law = self.outside_law
            message.job_id = self.job_id
            message.job_json = self.job
            message.searched_json = self.searched
            message.latency_ms = latency_ms
            message.error_json = error
            if self.usage:
                message.tokens_in = self.usage.tokens_in
                message.tokens_out = self.usage.tokens_out
                message.model_id = self.usage.model_id
                message.prompt_version = self.usage.prompt_version
            if self.trace:
                db.add(
                    RetrievalTrace(
                        matter_id=ctx.matter_id,
                        message_id=message.id,
                        rewritten_query=self.trace.rewritten_query,
                        sub_queries_json=self.trace.sub_queries,
                        filters_json=self.trace.filters,
                        bm25_hits_json=self.trace.bm25_hits,
                        vector_hits_json=self.trace.vector_hits,
                        fused_json=self.trace.fused,
                        reranked_json=self.trace.reranked,
                        gate_score=self.trace.gate_score,
                    )
                )
            run.status = {"complete": "done"}.get(status, status)
            run.intent = self.intent
            run.finished_at = utcnow()
            run.error_json = error
            conversation.updated_at = utcnow()
            if conversation.title is None:
                conversation.title = title_from(ctx.content)
            events.emit(
                db,
                ctx.matter_id,
                "conversation.updated",
                {"conversation_id": conversation.id, "title": conversation.title},
            )
            return {
                "message_id": message.id,
                "tokens_in": message.tokens_in or 0,
                "tokens_out": message.tokens_out or 0,
                "latency_ms": latency_ms,
            }

    async def finish(self, status: str, error: dict[str, Any] | None = None) -> dict[str, Any]:
        return await anyio.to_thread.run_sync(self._finish_sync, status, error)


def done_payload_from_db(db: Session, run: Run) -> tuple[str, dict[str, Any]]:
    """For a stream opened after the run's buffer expired: one terminal event rebuilt from what was stored."""
    message = db.get(Message, run.assistant_message_id)
    if run.status == "cancelled":
        return "done", {"cancelled": True, "message_id": run.assistant_message_id}
    if run.status == "failed" or message is None:
        error = run.error_json or {"code": "internal_error", "message": "The answer could not be completed."}
        return "error", error
    return "done", {
        "message_id": message.id,
        "tokens_in": message.tokens_in or 0,
        "tokens_out": message.tokens_out or 0,
        "latency_ms": message.latency_ms or 0,
    }


def dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False)
