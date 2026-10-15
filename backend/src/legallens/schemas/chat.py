"""C · Chat history and D · Chat."""

from typing import Literal

from pydantic import Field

from legallens.schemas.common import RequestModel, ResponseModel, Scope, Timestamp

Mode = Literal["auto", "ask", "summarize", "draft"]
Intent = Literal["ask", "summarize", "draft", "refine_draft", "clarify"]
AnswerState = Literal["found", "partial", "not_found"]
FeedbackKind = Literal["helpful", "wrong_citation", "missed_something", "should_be_not_found"]
SummaryTemplate = Literal["letter_demand", "pleading", "opinion"]
Audience = Literal["one_paragraph", "detailed", "plain_english"]
DraftType = Literal["response_letter", "memo"]


class ConversationCreate(RequestModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    scope: Scope | None = None


class ConversationUpdate(RequestModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    pinned: bool | None = None


class ConversationOut(ResponseModel):
    id: str
    matter_id: str
    title: str
    pinned: bool
    scope: Scope
    created_at: Timestamp
    updated_at: Timestamp


class CitationOut(ResponseModel):
    id: int
    n: int
    document_id: str
    document_name: str
    page: int
    para_ref: str | None = None
    quote: str
    verified: bool


class SearchedOut(ResponseModel):
    """What a turn searched (DEC-22), shown under the answer as "What was searched"."""

    scope_label: str
    rewritten_question: str
    documents_searched: int
    passages_reviewed: int
    passages_used: int


class JobRefOut(ResponseModel):
    """The background job a turn started, and the summary or draft it is making."""

    kind: Literal["summarize", "draft", "regenerate"]
    entity_id: str


class MessageOut(ResponseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "streaming", "cancelled", "failed"]
    mode: Mode | None = None
    intent: Intent | None = None
    answer_state: AnswerState | None = None
    outside_law: bool = False
    scope_label: str | None = None
    citations: list[CitationOut] = Field(default_factory=list)
    searched: SearchedOut | None = None
    run_id: str | None = None
    job_id: str | None = None
    job: JobRefOut | None = None
    model_id: str | None = None
    prompt_version: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    latency_ms: int | None = None
    feedback: FeedbackKind | None = None
    created_at: Timestamp


class SendOptions(RequestModel):
    summary_template: SummaryTemplate | None = None
    audience: Audience | None = None
    draft_type: DraftType | None = None
    incoming_document_id: str | None = None
    supporting_document_ids: list[str] = Field(default_factory=list, max_length=50)
    draft_id: str | None = None


class SendMessage(RequestModel):
    content: str = Field(min_length=1, max_length=8000)
    scope: Scope = Field(default_factory=Scope)
    mode: Mode = "auto"
    options: SendOptions | None = None


class SendMessageAccepted(ResponseModel):
    message_id: str
    run_id: str
    stream_url: str


class RunStatusOut(ResponseModel):
    run_id: str
    status: Literal["running", "done", "cancelled", "failed"]


class FeedbackIn(RequestModel):
    kind: FeedbackKind
    note: str | None = Field(default=None, max_length=2000)


class FeedbackOut(ResponseModel):
    message_id: str
    kind: FeedbackKind
    note: str | None = None
    updated_at: Timestamp
