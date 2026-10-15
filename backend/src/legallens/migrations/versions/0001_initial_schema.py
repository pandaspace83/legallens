"""Initial schema: the 20 tables of TA frame 7, plus runs and matter_events.

FTS5, sqlite-vec and the append-only audit triggers are raw SQL at the end of upgrade().

Revision ID: 0001
Revises:
Create Date: 2026-10-06 22:10:47.954012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ts", sa.DateTime(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("matter_id", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("prev_hash", sa.String(), nullable=False),
        sa.Column("hash", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_audit_log_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("totp_secret", sa.LargeBinary(), nullable=True),
        sa.Column("licensing_states", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "matters",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("client_name", sa.String(), nullable=False),
        sa.Column("our_side", sa.String(), nullable=False),
        sa.Column("court", sa.String(), nullable=True),
        sa.Column("jurisdiction", sa.String(), nullable=True),
        sa.Column("practice_area", sa.String(), nullable=True),
        sa.Column("profile_json", sa.JSON(), nullable=False),
        sa.Column("ai_consent_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("matters", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_matters_owner_user_id"), ["owner_user_id"], unique=False)

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("mfa_verified", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_sessions_user_id"), ["user_id"], unique=False)

    op.create_table(
        "conversations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("title_source", sa.String(), nullable=False),
        sa.Column("scope_json", sa.JSON(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("pinned", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_conversations_matter_id"), ["matter_id"], unique=False)
        batch_op.create_index(
            "ix_conversations_sidebar",
            ["matter_id", "pinned", "updated_at"],
            unique=False,
        )

    op.create_table(
        "documents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("mime", sa.String(), nullable=False),
        sa.Column("ext", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("origin", sa.String(), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("scan_status", sa.String(), nullable=False),
        sa.Column("pages_total", sa.Integer(), nullable=True),
        sa.Column("pages_processed", sa.Integer(), nullable=False),
        sa.Column("ocr_conf_avg", sa.Float(), nullable=True),
        sa.Column("hidden_content_json", sa.JSON(), nullable=True),
        sa.Column("coverage_json", sa.JSON(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("parent_document_id", sa.String(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.Column("ready_at", sa.DateTime(), nullable=True),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("matter_id", "sha256", name="uq_documents_matter_sha256"),
    )
    with op.batch_alter_table("documents", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_documents_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "matter_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("data_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("matter_events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_matter_events_created_at"), ["created_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_matter_events_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "chunks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("parent_chunk_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("section_path", sa.String(), nullable=True),
        sa.Column("clause_ref", sa.String(), nullable=True),
        sa.Column("para_ref", sa.String(), nullable=True),
        sa.Column("header", sa.Text(), nullable=False),
        sa.Column("page_start", sa.Integer(), nullable=False),
        sa.Column("page_end", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("bbox_json", sa.JSON(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_chunk_id"], ["chunks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("chunks", schema=None) as batch_op:
        batch_op.create_index("ix_chunks_document_seq", ["document_id", "seq"], unique=False)
        batch_op.create_index(batch_op.f("ix_chunks_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "drafts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("incoming_document_id", sa.String(), nullable=True),
        sa.Column("supporting_document_ids_json", sa.JSON(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("safeguards_json", sa.JSON(), nullable=False),
        sa.Column("acknowledgments_json", sa.JSON(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["incoming_document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("drafts", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_drafts_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("step", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_jobs_document_id"), ["document_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_jobs_matter_id"), ["matter_id"], unique=False)
        batch_op.create_index("ix_jobs_queue", ["status", "available_at"], unique=False)

    op.create_table(
        "messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=True),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("answer_state", sa.String(), nullable=True),
        sa.Column("outside_law", sa.Boolean(), nullable=False),
        sa.Column("scope_json", sa.JSON(), nullable=True),
        sa.Column("scope_label", sa.String(), nullable=True),
        sa.Column("run_id", sa.String(), nullable=True),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("prompt_version", sa.String(), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True),
        sa.Column("request_hash", sa.String(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "idempotency_key", name="uq_messages_idempotency"),
    )
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_messages_matter_id"), ["matter_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_messages_run_id"), ["run_id"], unique=False)
        batch_op.create_index("ix_messages_thread", ["conversation_id", "created_at"], unique=False)

    op.create_table(
        "pages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=False),
        sa.Column("has_text_layer", sa.Boolean(), nullable=False),
        sa.Column("ocr_conf", sa.Float(), nullable=True),
        sa.Column("readable", sa.Boolean(), nullable=False),
        sa.Column("layout_json", sa.JSON(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "page_no", name="uq_pages_document_page"),
    )
    with op.batch_alter_table("pages", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_pages_document_id"), ["document_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_pages_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "summaries",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("template", sa.String(), nullable=False),
        sa.Column("audience", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=True),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("coverage_json", sa.JSON(), nullable=True),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("prompt_version", sa.String(), nullable=True),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("summaries", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_summaries_document_id"), ["document_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_summaries_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "defined_terms",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("term", sa.String(), nullable=False),
        sa.Column("definition_chunk_id", sa.Integer(), nullable=True),
        sa.Column("definition_text", sa.Text(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["definition_chunk_id"], ["chunks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("defined_terms", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_defined_terms_document_id"), ["document_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_defined_terms_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "draft_versions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("draft_id", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=False),
        sa.Column("checks_json", sa.JSON(), nullable=False),
        sa.Column("diff_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["draft_id"], ["drafts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("draft_id", "version", name="uq_draft_versions"),
    )
    with op.batch_alter_table("draft_versions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_draft_versions_draft_id"), ["draft_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_draft_versions_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "exports",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("draft_id", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["draft_id"], ["drafts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("exports", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_exports_draft_id"), ["draft_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_exports_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id"),
    )
    with op.batch_alter_table("feedback", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_feedback_matter_id"), ["matter_id"], unique=False)

    op.create_table(
        "message_citations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("chunk_id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.String(), nullable=False),
        sa.Column("n", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("para_ref", sa.String(), nullable=True),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("bbox_json", sa.JSON(), nullable=True),
        sa.Column("verified", sa.Boolean(), nullable=False),
        sa.Column("rerank_score", sa.Float(), nullable=True),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["chunk_id"], ["chunks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("message_citations", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_message_citations_chunk_id"), ["chunk_id"], unique=False)
        batch_op.create_index(
            batch_op.f("ix_message_citations_document_id"),
            ["document_id"],
            unique=False,
        )
        batch_op.create_index(batch_op.f("ix_message_citations_matter_id"), ["matter_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_message_citations_message_id"), ["message_id"], unique=False)

    op.create_table(
        "retrieval_traces",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("rewritten_query", sa.Text(), nullable=True),
        sa.Column("sub_queries_json", sa.JSON(), nullable=False),
        sa.Column("filters_json", sa.JSON(), nullable=False),
        sa.Column("bm25_hits_json", sa.JSON(), nullable=False),
        sa.Column("vector_hits_json", sa.JSON(), nullable=False),
        sa.Column("fused_json", sa.JSON(), nullable=False),
        sa.Column("reranked_json", sa.JSON(), nullable=False),
        sa.Column("gate_score", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("retrieval_traces", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_retrieval_traces_matter_id"), ["matter_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_retrieval_traces_message_id"), ["message_id"], unique=False)

    op.create_table(
        "runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.String(), nullable=False),
        sa.Column("user_message_id", sa.String(), nullable=False),
        sa.Column("assistant_message_id", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("matter_id", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["assistant_message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matter_id"], ["matters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("runs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_runs_conversation_id"), ["conversation_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_runs_matter_id"), ["matter_id"], unique=False)

    _create_search_and_audit_objects()


def _embed_dim() -> int:
    config = op.get_context().config
    configured = config.attributes.get("embed_dim") if config is not None else None
    return int(configured or 1024)


def _create_search_and_audit_objects() -> None:
    # Keyword index over child chunks. External content: the text lives once, in `chunks`.
    op.execute(
        "CREATE VIRTUAL TABLE chunks_fts USING fts5("
        "text, header, content='chunks', content_rowid='id', tokenize='porter unicode61')"
    )
    # Parent (section) rows are never indexed. The WHEN clauses must match on insert and delete: issuing an
    # FTS5 'delete' for a row that was never inserted corrupts an external-content index.
    op.execute(
        "CREATE TRIGGER chunks_fts_ai AFTER INSERT ON chunks WHEN new.kind != 'section' BEGIN "
        "INSERT INTO chunks_fts(rowid, text, header) VALUES (new.id, new.text, new.header); END"
    )
    op.execute(
        "CREATE TRIGGER chunks_fts_ad AFTER DELETE ON chunks WHEN old.kind != 'section' BEGIN "
        "INSERT INTO chunks_fts(chunks_fts, rowid, text, header) VALUES ('delete', old.id, old.text, old.header); END"
    )
    op.execute(
        "CREATE TRIGGER chunks_fts_au_del AFTER UPDATE ON chunks WHEN old.kind != 'section' BEGIN "
        "INSERT INTO chunks_fts(chunks_fts, rowid, text, header) VALUES ('delete', old.id, old.text, old.header); END"
    )
    op.execute(
        "CREATE TRIGGER chunks_fts_au_ins AFTER UPDATE ON chunks WHEN new.kind != 'section' BEGIN "
        "INSERT INTO chunks_fts(rowid, text, header) VALUES (new.id, new.text, new.header); END"
    )
    # Vector index. The partition key keeps every KNN search inside one matter (DEC-53); the document_id
    # metadata column filters "This document" inside the same query.
    op.execute(
        "CREATE VIRTUAL TABLE chunks_vec USING vec0("
        "matter_id text partition key, document_id text, "
        f"embedding float[{_embed_dim()}] distance_metric=cosine)"
    )
    # Deleting a chunk (directly or by cascade from its document or matter) deletes its vector (DEC-58).
    op.execute(
        "CREATE TRIGGER chunks_vec_ad AFTER DELETE ON chunks BEGIN DELETE FROM chunks_vec WHERE rowid = old.id; END"
    )
    # The audit log is append-only (DEC-68).
    op.execute(
        "CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN "
        "SELECT RAISE(ABORT, 'audit_log is append-only'); END"
    )
    op.execute(
        "CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN "
        "SELECT RAISE(ABORT, 'audit_log is append-only'); END"
    )


def downgrade() -> None:
    for trigger in (
        "audit_log_no_delete",
        "audit_log_no_update",
        "chunks_vec_ad",
        "chunks_fts_au_ins",
        "chunks_fts_au_del",
        "chunks_fts_ad",
        "chunks_fts_ai",
    ):
        op.execute(f"DROP TRIGGER IF EXISTS {trigger}")
    op.execute("DROP TABLE IF EXISTS chunks_vec")
    op.execute("DROP TABLE IF EXISTS chunks_fts")
    with op.batch_alter_table("runs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_runs_matter_id"))
        batch_op.drop_index(batch_op.f("ix_runs_conversation_id"))

    op.drop_table("runs")
    with op.batch_alter_table("retrieval_traces", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_retrieval_traces_message_id"))
        batch_op.drop_index(batch_op.f("ix_retrieval_traces_matter_id"))

    op.drop_table("retrieval_traces")
    with op.batch_alter_table("message_citations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_message_citations_message_id"))
        batch_op.drop_index(batch_op.f("ix_message_citations_matter_id"))
        batch_op.drop_index(batch_op.f("ix_message_citations_document_id"))
        batch_op.drop_index(batch_op.f("ix_message_citations_chunk_id"))

    op.drop_table("message_citations")
    with op.batch_alter_table("feedback", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_feedback_matter_id"))

    op.drop_table("feedback")
    with op.batch_alter_table("exports", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_exports_matter_id"))
        batch_op.drop_index(batch_op.f("ix_exports_draft_id"))

    op.drop_table("exports")
    with op.batch_alter_table("draft_versions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_draft_versions_matter_id"))
        batch_op.drop_index(batch_op.f("ix_draft_versions_draft_id"))

    op.drop_table("draft_versions")
    with op.batch_alter_table("defined_terms", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_defined_terms_matter_id"))
        batch_op.drop_index(batch_op.f("ix_defined_terms_document_id"))

    op.drop_table("defined_terms")
    with op.batch_alter_table("summaries", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_summaries_matter_id"))
        batch_op.drop_index(batch_op.f("ix_summaries_document_id"))

    op.drop_table("summaries")
    with op.batch_alter_table("pages", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_pages_matter_id"))
        batch_op.drop_index(batch_op.f("ix_pages_document_id"))

    op.drop_table("pages")
    with op.batch_alter_table("messages", schema=None) as batch_op:
        batch_op.drop_index("ix_messages_thread")
        batch_op.drop_index(batch_op.f("ix_messages_run_id"))
        batch_op.drop_index(batch_op.f("ix_messages_matter_id"))

    op.drop_table("messages")
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.drop_index("ix_jobs_queue")
        batch_op.drop_index(batch_op.f("ix_jobs_matter_id"))
        batch_op.drop_index(batch_op.f("ix_jobs_document_id"))

    op.drop_table("jobs")
    with op.batch_alter_table("drafts", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_drafts_matter_id"))

    op.drop_table("drafts")
    with op.batch_alter_table("chunks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_chunks_matter_id"))
        batch_op.drop_index("ix_chunks_document_seq")

    op.drop_table("chunks")
    with op.batch_alter_table("matter_events", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_matter_events_matter_id"))
        batch_op.drop_index(batch_op.f("ix_matter_events_created_at"))

    op.drop_table("matter_events")
    with op.batch_alter_table("documents", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_documents_matter_id"))

    op.drop_table("documents")
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.drop_index("ix_conversations_sidebar")
        batch_op.drop_index(batch_op.f("ix_conversations_matter_id"))

    op.drop_table("conversations")
    with op.batch_alter_table("sessions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_sessions_user_id"))

    op.drop_table("sessions")
    with op.batch_alter_table("matters", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_matters_owner_user_id"))

    op.drop_table("matters")
    op.drop_table("users")
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_audit_log_matter_id"))

    op.drop_table("audit_log")
