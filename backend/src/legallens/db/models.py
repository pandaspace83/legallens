"""ORM models: the 20 tables of TA frame 7 plus `runs` and `matter_events` (BACKEND_TODO §4.2).

`chunks_fts` (FTS5) and `chunks_vec` (sqlite-vec) are virtual tables created in the migration with raw SQL;
they share `chunks.id` as their rowid.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from legallens.db.base import Base, MatterScoped
from legallens.timeutil import utcnow

# ---------------------------------------------------------------- identity and matters


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    password_hash: Mapped[str | None] = mapped_column(String)  # argon2id, when real sign-in is built
    totp_secret: Mapped[bytes | None] = mapped_column(LargeBinary)  # encrypted, when real sign-in is built
    licensing_states: Mapped[list[Any]] = mapped_column(default=list)  # DEC-29
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_login_at: Mapped[datetime | None]
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None]


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # sha256 of the cookie token
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mfa_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]


class Matter(Base):
    __tablename__ = "matters"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str]
    client_name: Mapped[str]
    our_side: Mapped[str]
    court: Mapped[str | None]
    jurisdiction: Mapped[str | None]
    practice_area: Mapped[str | None]
    profile_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # parties, counsel (DEC-30)
    ai_consent_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # DEC-60
    status: Mapped[str] = mapped_column(String, default="open")  # open | closed
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    closed_at: Mapped[datetime | None]
    last_activity_at: Mapped[datetime] = mapped_column(default=utcnow)


# ---------------------------------------------------------------- chat history


class Conversation(MatterScoped, Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_sidebar", "matter_id", "pinned", "updated_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str | None]  # None until the first turn sets one automatically
    title_source: Mapped[str] = mapped_column(String, default="auto")  # auto | user
    scope_json: Mapped[dict[str, Any]] = mapped_column(default=lambda: {"kind": "all", "document_ids": []})
    summary: Mapped[str | None] = mapped_column(Text)  # rolling memory, written by the orchestrator
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)


class Message(MatterScoped, Base):
    __tablename__ = "messages"
    __table_args__ = (
        UniqueConstraint("conversation_id", "idempotency_key", name="uq_messages_idempotency"),
        Index("ix_messages_thread", "conversation_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str]  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="complete")  # complete | streaming | cancelled | failed
    mode: Mapped[str | None]
    intent: Mapped[str | None]
    answer_state: Mapped[str | None]  # found | partial | not_found
    outside_law: Mapped[bool] = mapped_column(Boolean, default=False)
    scope_json: Mapped[dict[str, Any] | None]
    scope_label: Mapped[str | None]
    run_id: Mapped[str | None] = mapped_column(index=True)
    job_id: Mapped[str | None]
    job_json: Mapped[dict[str, Any] | None]  # {kind, entity_id} of the job the turn started (0002)
    searched_json: Mapped[dict[str, Any] | None]  # what the turn searched, DEC-22 (0002)
    model_id: Mapped[str | None]
    prompt_version: Mapped[str | None]
    tokens_in: Mapped[int | None]
    tokens_out: Mapped[int | None]
    latency_ms: Mapped[int | None]
    idempotency_key: Mapped[str | None]
    request_hash: Mapped[str | None]
    error_json: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class MessageCitation(MatterScoped, Base):
    __tablename__ = "message_citations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    chunk_id: Mapped[int] = mapped_column(ForeignKey("chunks.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    n: Mapped[int]  # [n] in the answer
    page: Mapped[int]
    para_ref: Mapped[str | None]
    quote: Mapped[str] = mapped_column(Text)
    bbox_json: Mapped[list[Any] | None]
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    rerank_score: Mapped[float | None] = mapped_column(Float)


class RetrievalTrace(MatterScoped, Base):
    __tablename__ = "retrieval_traces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    rewritten_query: Mapped[str | None] = mapped_column(Text)
    sub_queries_json: Mapped[list[Any]] = mapped_column(default=list)
    filters_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    bm25_hits_json: Mapped[list[Any]] = mapped_column(default=list)
    vector_hits_json: Mapped[list[Any]] = mapped_column(default=list)
    fused_json: Mapped[list[Any]] = mapped_column(default=list)
    reranked_json: Mapped[list[Any]] = mapped_column(default=list)
    gate_score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Feedback(MatterScoped, Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), unique=True)
    kind: Mapped[str]  # helpful | wrong_citation | missed_something | should_be_not_found
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)


class Run(MatterScoped, Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    user_message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    assistant_message_id: Mapped[str] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"))
    mode: Mapped[str]
    intent: Mapped[str | None]
    status: Mapped[str] = mapped_column(String, default="running")  # running | done | cancelled | failed
    error_json: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None]


# ---------------------------------------------------------------- documents and the hybrid index


class Document(MatterScoped, Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("matter_id", "sha256", name="uq_documents_matter_sha256"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    filename: Mapped[str]
    mime: Mapped[str]
    ext: Mapped[str]
    size_bytes: Mapped[int]
    sha256: Mapped[str]
    origin: Mapped[str]  # client | other_party (DEC-59)
    storage_path: Mapped[str]
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|processing|ready|failed|quarantined
    scan_status: Mapped[str] = mapped_column(String, default="skipped")  # clean | infected | skipped
    pages_total: Mapped[int | None]
    pages_processed: Mapped[int] = mapped_column(Integer, default=0)
    ocr_conf_avg: Mapped[float | None] = mapped_column(Float)
    hidden_content_json: Mapped[dict[str, Any] | None]
    coverage_json: Mapped[dict[str, Any] | None]
    metadata_json: Mapped[dict[str, Any] | None]  # Bates ranges, email headers, converter used
    parent_document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    error_json: Mapped[dict[str, Any] | None]
    uploaded_at: Mapped[datetime] = mapped_column(default=utcnow)
    ready_at: Mapped[datetime | None]


class DocPage(MatterScoped, Base):
    __tablename__ = "pages"
    __table_args__ = (UniqueConstraint("document_id", "page_no", name="uq_pages_document_page"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page_no: Mapped[int]
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    has_text_layer: Mapped[bool] = mapped_column(Boolean, default=True)
    ocr_conf: Mapped[float | None] = mapped_column(Float)
    readable: Mapped[bool] = mapped_column(Boolean, default=True)
    layout_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # blocks with boxes, Bates stamp


class Chunk(MatterScoped, Base):
    __tablename__ = "chunks"
    __table_args__ = (Index("ix_chunks_document_seq", "document_id", "seq"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)  # rowid of FTS5 and vec0
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    parent_chunk_id: Mapped[int | None] = mapped_column(ForeignKey("chunks.id", ondelete="CASCADE"))
    kind: Mapped[str]  # section (parent, not indexed) | text | table | footnote
    seq: Mapped[int]  # reading order within the document
    section_path: Mapped[str | None]
    clause_ref: Mapped[str | None]
    para_ref: Mapped[str | None]
    header: Mapped[str] = mapped_column(Text, default="")  # "Smith MSA v3 › 4 Termination › 4.2(a)"
    page_start: Mapped[int]
    page_end: Mapped[int]
    text: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    bbox_json: Mapped[list[Any]] = mapped_column(default=list)  # [{page, bbox: [x0, y0, x1, y1]}]


class DefinedTerm(MatterScoped, Base):
    __tablename__ = "defined_terms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    term: Mapped[str]
    definition_chunk_id: Mapped[int | None] = mapped_column(ForeignKey("chunks.id", ondelete="CASCADE"))
    definition_text: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- work products


class Summary(MatterScoped, Base):
    __tablename__ = "summaries"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    # The chat that asked for it, if any (0002)
    conversation_id: Mapped[str | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"))
    template: Mapped[str]
    audience: Mapped[str]
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | ready | failed
    job_id: Mapped[str | None]
    content_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    coverage_json: Mapped[dict[str, Any] | None]
    model_id: Mapped[str | None]
    prompt_version: Mapped[str | None]
    error_json: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Draft(MatterScoped, Base):
    __tablename__ = "drafts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    conversation_id: Mapped[str | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"))
    type: Mapped[str]  # response_letter | memo
    title: Mapped[str] = mapped_column(String, default="")
    incoming_document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"))
    supporting_document_ids_json: Mapped[list[Any]] = mapped_column(default=list)
    instructions: Mapped[str | None] = mapped_column(Text)
    date_line: Mapped[str | None]  # the letter's or memo's date, e.g. "October 10, 2026" (0002)
    model_id: Mapped[str | None]  # who wrote the first version (0002)
    prompt_version: Mapped[str | None]
    waived_claims_json: Mapped[list[Any]] = mapped_column(default=list)  # claims the lawyer set aside, DEC-47 (0002)
    added_authorities_json: Mapped[list[Any]] = mapped_column(default=list)  # sources the lawyer named (0002)
    proposals_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # previews awaiting accept, DEC-44 (0002)
    status: Mapped[str] = mapped_column(String, default="generating")  # generating|not_reviewed|reviewed_adopted|failed
    current_version: Mapped[int] = mapped_column(Integer, default=0)
    safeguards_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    acknowledgments_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    job_id: Mapped[str | None]
    reviewed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow)


class DraftVersion(MatterScoped, Base):
    __tablename__ = "draft_versions"
    __table_args__ = (UniqueConstraint("draft_id", "version", name="uq_draft_versions"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    version: Mapped[int]
    source: Mapped[str]  # ai | lawyer | regenerate | restore
    label: Mapped[str] = mapped_column(String, default="")  # what changed, for version history (0002)
    content_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # sections + claims
    checks_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    diff_json: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Export(MatterScoped, Base):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    draft_id: Mapped[str | None] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    summary_id: Mapped[str | None] = mapped_column(  # (0002)
        ForeignKey("summaries.id", ondelete="CASCADE", name="fk_exports_summary_id"), index=True
    )
    kind: Mapped[str]  # clean | working | matter_zip | summary
    version: Mapped[int | None]
    sha256: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


# ---------------------------------------------------------------- operations


class Job(MatterScoped, Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_queue", "status", "available_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str]  # ingest | summarize | draft | regenerate | export
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|running|done|failed|cancelled
    progress: Mapped[int] = mapped_column(Integer, default=0)
    step: Mapped[str | None]
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    result_json: Mapped[dict[str, Any] | None]
    error_json: Mapped[dict[str, Any] | None]
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    available_at: Mapped[datetime] = mapped_column(default=utcnow)
    heartbeat_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]


class MatterEvent(MatterScoped, Base):
    __tablename__ = "matter_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)  # the SSE id
    type: Mapped[str]
    data_json: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)


class AuditLog(Base):
    """Append-only and hash-chained. No foreign key to matters: rows outlive a deleted matter (DEC-13)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(default=utcnow)
    user_id: Mapped[str | None]
    matter_id: Mapped[str | None] = mapped_column(index=True)
    action: Mapped[str]
    entity_type: Mapped[str]
    entity_id: Mapped[str | None]
    details_json: Mapped[dict[str, Any]] = mapped_column(default=dict)  # IDs, counts and enums only
    prev_hash: Mapped[str]
    hash: Mapped[str]


class IndexMeta(Base):
    """Which embedding model built a matter's vectors: key `embedding:<matter_id>`, value its signature (D7).
    Read and written through search/index_guard.py with raw SQL, so it is not matter-scoped."""

    __tablename__ = "index_meta"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str]


SCOPED_MODELS: tuple[type[Base], ...] = (
    Conversation,
    Message,
    MessageCitation,
    RetrievalTrace,
    Feedback,
    Run,
    Document,
    DocPage,
    Chunk,
    DefinedTerm,
    Summary,
    Draft,
    DraftVersion,
    Export,
    Job,
    MatterEvent,
)
