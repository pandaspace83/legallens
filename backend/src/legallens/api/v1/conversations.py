"""C · Chat history: the sidebar list, + New chat, rename, pin, delete, and loading a thread."""

from fastapi import APIRouter, Query, Request, Response

from legallens.api.deps import CurrentUser, ReadDB, WriteDB, load_in_matter, load_matter
from legallens.db.models import Conversation
from legallens.schemas.chat import ConversationCreate, ConversationOut, ConversationUpdate, MessageOut
from legallens.schemas.common import Page, problem_responses
from legallens.search.scope import resolve_scope
from legallens.services import conversations as svc

router = APIRouter(tags=["C · Chat history"])


@router.get(
    "/matters/{matter_id}/conversations", operation_id="listConversations", responses=problem_responses(401, 403, 404)
)
def list_conversations(
    matter_id: str,
    me: CurrentUser,
    db: ReadDB,
    cursor: str | None = None,
    q: str | None = Query(None, max_length=200, description="Search chat titles."),
    limit: int = Query(30, ge=1, le=100),
) -> Page[ConversationOut]:
    """Pinned chats first, then newest first."""
    matter = load_matter(db, me, matter_id)
    items, next_cursor = svc.list_page(db, matter.id, q, cursor, limit)
    return Page[ConversationOut](items=items, next_cursor=next_cursor)


@router.post(
    "/matters/{matter_id}/conversations",
    status_code=201,
    operation_id="createConversation",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_conversation(matter_id: str, body: ConversationCreate, me: CurrentUser, db: WriteDB) -> ConversationOut:
    matter = load_matter(db, me, matter_id, writable=True)
    if body.scope is not None:
        resolve_scope(db, matter.id, body.scope)
    conversation = svc.create(db, me, matter, body)
    db.commit()
    return svc.to_out(conversation)


@router.patch(
    "/conversations/{conversation_id}",
    operation_id="updateConversation",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def update_conversation(
    conversation_id: str, body: ConversationUpdate, me: CurrentUser, db: WriteDB
) -> ConversationOut:
    conversation, _ = load_in_matter(db, me, Conversation, conversation_id, writable=True, label="Chat")
    svc.update(db, conversation, body)
    db.commit()
    return svc.to_out(conversation)


@router.delete(
    "/conversations/{conversation_id}",
    status_code=204,
    operation_id="deleteConversation",
    responses=problem_responses(401, 403, 404, 409),
)
def delete_conversation(conversation_id: str, request: Request, me: CurrentUser, db: WriteDB) -> Response:
    conversation, _ = load_in_matter(db, me, Conversation, conversation_id, writable=True, label="Chat")
    request.app.state.runs.cancel_conversation(conversation.id)
    svc.remove(db, me, conversation)
    db.commit()
    return Response(status_code=204)


@router.get(
    "/conversations/{conversation_id}/messages",
    operation_id="listMessages",
    responses=problem_responses(401, 403, 404),
)
def list_messages(
    conversation_id: str,
    me: CurrentUser,
    db: ReadDB,
    before: str | None = Query(None, description="Cursor from a previous page; returns older messages."),
    limit: int = Query(50, ge=1, le=200),
) -> Page[MessageOut]:
    conversation, _ = load_in_matter(db, me, Conversation, conversation_id, label="Chat")
    items, next_cursor = svc.messages_page(db, conversation.id, before, limit)
    return Page[MessageOut](items=items, next_cursor=next_cursor)
