"""Chat history per matter (DEC-31): the sidebar list, rename, pin, delete, and paged message history."""

from datetime import datetime

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from legallens.db.models import Conversation, Document, Feedback, Matter, Message, MessageCitation
from legallens.ids import new_id
from legallens.schemas.chat import (
    CitationOut,
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    JobRefOut,
    MessageOut,
    SearchedOut,
)
from legallens.schemas.common import Scope
from legallens.services import audit, matters
from legallens.services.auth import Principal
from legallens.services.pagination import decode_cursor, encode_cursor, escape_like
from legallens.timeutil import iso, utcnow

NEW_CHAT_TITLE = "New chat"
TITLE_LIMIT = 60


def title_from(text: str) -> str:
    """The first words of the first question, cut at a word boundary."""
    flat = " ".join(text.split())
    if len(flat) <= TITLE_LIMIT:
        return flat.rstrip("?.! ") or NEW_CHAT_TITLE
    return flat[:TITLE_LIMIT].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def to_out(c: Conversation) -> ConversationOut:
    return ConversationOut(
        id=c.id,
        matter_id=c.matter_id,
        title=c.title or NEW_CHAT_TITLE,
        pinned=c.pinned,
        scope=Scope.model_validate(c.scope_json or {"kind": "all"}),
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def list_page(
    db: Session, matter_id: str, q: str | None, cursor: str | None, limit: int
) -> tuple[list[ConversationOut], str | None]:
    pinned_rank = func.iif(Conversation.pinned, 0, 1)
    stmt = select(Conversation).where(Conversation.matter_id == matter_id)
    if q and q.strip():
        stmt = stmt.where(Conversation.title.ilike(f"%{escape_like(q.strip())}%", escape="\\"))
    after = decode_cursor(cursor)
    if after:
        rank, updated_iso, last_id = after
        updated = datetime.fromisoformat(updated_iso)
        stmt = stmt.where(
            or_(
                pinned_rank > rank,
                and_(pinned_rank == rank, Conversation.updated_at < updated),
                and_(pinned_rank == rank, Conversation.updated_at == updated, Conversation.id < last_id),
            )
        )
    stmt = stmt.order_by(pinned_rank, Conversation.updated_at.desc(), Conversation.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars())
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit and page:
        last = page[-1]
        next_cursor = encode_cursor([0 if last.pinned else 1, iso(last.updated_at), last.id])
    return [to_out(c) for c in page], next_cursor


def create(db: Session, me: Principal, matter: Matter, body: ConversationCreate) -> Conversation:
    now = utcnow()
    conversation = Conversation(
        id=new_id("conversation"),
        matter_id=matter.id,
        user_id=me.user.id,
        title=body.title,
        title_source="user" if body.title else "auto",
        scope_json=(body.scope or Scope()).model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(conversation)
    matters.touch(matter)
    db.flush()
    return conversation


def update(db: Session, conversation: Conversation, body: ConversationUpdate) -> Conversation:
    if body.title is not None:
        conversation.title = body.title.strip()
        conversation.title_source = "user"
    if body.pinned is not None:
        conversation.pinned = body.pinned
    return conversation


def remove(db: Session, me: Principal, conversation: Conversation) -> None:
    conversation_id, matter_id = conversation.id, conversation.matter_id
    db.execute(
        delete(Conversation).where(Conversation.id == conversation_id), execution_options={"synchronize_session": False}
    )
    audit.append(
        db,
        action="delete",
        entity_type="conversation",
        entity_id=conversation_id,
        user_id=me.user.id,
        matter_id=matter_id,
    )


def citations_for(db: Session, message_ids: list[str]) -> dict[str, list[CitationOut]]:
    if not message_ids:
        return {}
    rows = db.execute(
        select(MessageCitation, Document.filename)
        .join(Document, Document.id == MessageCitation.document_id)
        .where(MessageCitation.message_id.in_(message_ids))
        .order_by(MessageCitation.message_id, MessageCitation.n)
    ).all()
    out: dict[str, list[CitationOut]] = {}
    for citation, filename in rows:
        out.setdefault(citation.message_id, []).append(
            CitationOut(
                id=citation.id,
                n=citation.n,
                document_id=citation.document_id,
                document_name=filename,
                page=citation.page,
                para_ref=citation.para_ref,
                quote=citation.quote,
                verified=citation.verified,
            )
        )
    return out


def message_out(m: Message, citations: list[CitationOut], feedback: str | None) -> MessageOut:
    return MessageOut(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role,  # type: ignore[arg-type]
        content=m.content,
        status=m.status,  # type: ignore[arg-type]
        mode=m.mode,  # type: ignore[arg-type]
        intent=m.intent,  # type: ignore[arg-type]
        answer_state=m.answer_state,  # type: ignore[arg-type]
        outside_law=m.outside_law,
        scope_label=m.scope_label,
        citations=citations,
        searched=SearchedOut(**m.searched_json) if m.searched_json else None,
        run_id=m.run_id,
        job_id=m.job_id,
        job=JobRefOut(**m.job_json) if m.job_json else None,
        model_id=m.model_id,
        prompt_version=m.prompt_version,
        tokens_in=m.tokens_in,
        tokens_out=m.tokens_out,
        latency_ms=m.latency_ms,
        feedback=feedback,  # type: ignore[arg-type]
        created_at=m.created_at,
    )


def messages_page(
    db: Session, conversation_id: str, before: str | None, limit: int
) -> tuple[list[MessageOut], str | None]:
    """Newest page first; items within a page run oldest to newest. next_cursor fetches older messages."""
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    after = decode_cursor(before)
    if after:
        created_iso, last_id = after
        created = datetime.fromisoformat(created_iso)
        stmt = stmt.where(or_(Message.created_at < created, and_(Message.created_at == created, Message.id < last_id)))
    rows = list(db.execute(stmt.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)).scalars())
    page = rows[:limit]
    next_cursor = encode_cursor([iso(page[-1].created_at), page[-1].id]) if len(rows) > limit and page else None
    page.reverse()
    ids = [m.id for m in page]
    cites = citations_for(db, ids)
    feedback = dict(db.execute(select(Feedback.message_id, Feedback.kind).where(Feedback.message_id.in_(ids))).all())
    return [message_out(m, cites.get(m.id, []), feedback.get(m.id)) for m in page], next_cursor
