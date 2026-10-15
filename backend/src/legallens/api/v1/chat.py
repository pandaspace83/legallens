"""D · Chat: send a message (202 + run), stream the run over SSE, stop it, give feedback."""

from collections.abc import AsyncIterator

from fastapi import APIRouter, Header, Request
from fastapi.concurrency import run_in_threadpool
from sse_starlette import EventSourceResponse, ServerSentEvent

from legallens.api.deps import CurrentUser, WriteDB, load_in_matter
from legallens.db.models import Conversation, Feedback, Message, Run
from legallens.errors import ApiError
from legallens.orchestrator import get_orchestrator
from legallens.schemas.chat import FeedbackIn, FeedbackOut, RunStatusOut, SendMessage, SendMessageAccepted
from legallens.schemas.common import problem_responses
from legallens.services import audit
from legallens.services.auth import Principal
from legallens.services.chat import create_turn, done_payload_from_db, dumps, stream_url
from legallens.timeutil import utcnow

router = APIRouter(tags=["D · Chat"])

SSE_RESPONSES = {200: {"content": {"text/event-stream": {}}, "description": "Server-Sent Events"}}


def _ping() -> ServerSentEvent:
    return ServerSentEvent(comment="ping")


def _parse_last_event_id(header: str | None, query: int | None) -> int:
    if query is not None:
        return max(0, query)
    if header and header.strip().isdigit():
        return int(header.strip())
    return 0


@router.post(
    "/conversations/{conversation_id}/messages",
    status_code=202,
    operation_id="sendMessage",
    responses=problem_responses(401, 403, 404, 409, 422, 428),
)
async def send_message(
    conversation_id: str,
    body: SendMessage,
    request: Request,
    me: CurrentUser,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key", max_length=200),
) -> SendMessageAccepted:
    """Saves the message and starts the run. Open `stream_url` with EventSource to follow it."""
    if not idempotency_key:
        raise ApiError(428, "idempotency_key_required", "Send an Idempotency-Key header with each new message.")
    app = request.app
    database, settings = app.state.database, app.state.settings

    def _create():  # type: ignore[no-untyped-def]
        with database.write_session() as db:
            conversation, matter = load_in_matter(db, me, Conversation, conversation_id, writable=True, label="Chat")
            turn = create_turn(db, database, settings, me, matter, conversation, body, idempotency_key)
            db.commit()
            return turn

    turn = await run_in_threadpool(_create)
    if turn.ctx is not None:
        app.state.runs.start(turn.ctx, get_orchestrator(settings))
    return SendMessageAccepted(message_id=turn.message_id, run_id=turn.run_id, stream_url=stream_url(turn.run_id))


def _load_run(request: Request, me: Principal, run_id: str) -> Run:
    with request.app.state.database.read_session() as db:
        run, _ = load_in_matter(db, me, Run, run_id, label="Run")
        db.expunge(run)
        return run


@router.get(
    "/runs/{run_id}/stream",
    operation_id="streamRun",
    response_class=EventSourceResponse,
    responses={**SSE_RESPONSES, **problem_responses(401, 403, 404)},  # type: ignore[dict-item]
)
async def stream_run(
    run_id: str,
    request: Request,
    me: CurrentUser,
    last_event_id_header: str | None = Header(None, alias="Last-Event-ID"),
    last_event_id: int | None = None,
) -> EventSourceResponse:
    """SSE for one turn: run.started → intent → scope → status… → token… → citation… → answer_state → done."""
    run = await run_in_threadpool(_load_run, request, me, run_id)
    registry = request.app.state.runs
    start_after = _parse_last_event_id(last_event_id_header, last_event_id)
    settings = request.app.state.settings

    if registry.get(run_id) is not None:
        source: AsyncIterator[dict[str, str]] = registry.stream(run_id, start_after)
    else:

        def _final() -> tuple[str, dict[str, object]]:
            with request.app.state.database.read_session() as db:
                load_in_matter(db, me, Run, run_id, label="Run")
                return done_payload_from_db(db, db.get(Run, run_id))  # type: ignore[arg-type]

        async def _replay_final() -> AsyncIterator[dict[str, str]]:
            name, data = await run_in_threadpool(_final)
            yield {"id": "1", "event": name, "data": dumps(data)}  # type: ignore[arg-type]

        source = _replay_final()
    del run
    return EventSourceResponse(source, ping=settings.sse_ping_seconds, ping_message_factory=_ping)


@router.post("/runs/{run_id}/cancel", operation_id="cancelRun", responses=problem_responses(401, 403, 404))
async def cancel_run(run_id: str, request: Request, me: CurrentUser) -> RunStatusOut:
    """The Stop button. The run ends with `done {cancelled: true}`; stopping a finished run changes nothing."""
    run = await run_in_threadpool(_load_run, request, me, run_id)
    status = await request.app.state.runs.cancel(run_id)
    if status is None:
        status = run.status
    return RunStatusOut(run_id=run_id, status=status)


@router.post(
    "/messages/{message_id}/feedback", operation_id="sendFeedback", responses=problem_responses(401, 403, 404, 422)
)
def send_feedback(message_id: str, body: FeedbackIn, me: CurrentUser, db: WriteDB) -> FeedbackOut:
    """Helpful, wrong citation, missed something, should have said not found (DEC-52). Resending replaces it."""
    message, _ = load_in_matter(db, me, Message, message_id, label="Message")
    if message.role != "assistant":
        raise ApiError(422, "not_assistant_message", "Feedback goes on an answer, not on your own message.")
    from sqlalchemy import select

    feedback = db.execute(select(Feedback).where(Feedback.message_id == message.id)).scalar_one_or_none()
    if feedback is None:
        feedback = Feedback(matter_id=message.matter_id, message_id=message.id, kind=body.kind, note=body.note)
        db.add(feedback)
    else:
        feedback.kind = body.kind
        feedback.note = body.note
        feedback.updated_at = utcnow()
    audit.append(
        db,
        action="feedback",
        entity_type="message",
        entity_id=message.id,
        user_id=me.user.id,
        matter_id=message.matter_id,
        details={"kind": body.kind, "has_note": bool(body.note)},
    )
    db.commit()
    return FeedbackOut(message_id=message.id, kind=feedback.kind, note=feedback.note, updated_at=feedback.updated_at)  # type: ignore[arg-type]
