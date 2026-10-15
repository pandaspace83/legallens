"""G · Drafts, checks, review and export (DEC-43 to DEC-51)."""

from typing import Annotated, Literal

from pydantic import Field

from legallens.schemas.chat import DraftType
from legallens.schemas.common import InlineCitation, RequestModel, ResponseModel, Timestamp

PlaceholderKind = Literal["placeholder", "cite_needed", "rule_needed", "unverified"]
ChecklistStatus = Literal["full_text_uploaded", "only_mentioned", "not_in_documents", "added_by_lawyer"]


class DraftSectionOut(ResponseModel):
    id: str
    heading: str
    content: str
    citations: list[InlineCitation]
    origin: Literal["ai", "lawyer"]
    claim_ids: list[str] = Field(default_factory=list)
    # Letters keep their head (addressee, Re line, greeting) as sections; these say how to lay each one out (INT-1.6)
    kind: str | None = None
    show_heading: bool = True


class PlaceholderOut(ResponseModel):
    token: str
    kind: PlaceholderKind
    section_id: str
    offset: int


class Addressee(ResponseModel):
    name: str
    firm: str | None = None
    address: str | None = None
    email: str | None = None
    rule: Literal["4.2", "4.3"] | None = None


class SafeguardsOut(ResponseModel):
    addressee: Addressee | None = None
    rule_4_3_reminder: bool = False
    fre408_header: bool = False
    reservation_of_rights: bool = False


class VersionInfo(ResponseModel):
    version: int
    source: Literal["ai", "lawyer", "regenerate", "restore"]
    label: str = ""  # what changed, e.g. "Filled in the dispute date" or "Restored version 1"
    created_at: Timestamp


ClaimStatus = Literal["addressed", "flagged", "missing", "waived"]


class ClaimOut(ResponseModel):
    """A point the incoming document makes, and how the draft deals with it (DEC-47)."""

    id: str
    text: str
    source: InlineCitation | None = None
    status: ClaimStatus
    addressed_by: str | None = None  # the first section answering it
    waived: bool = False  # the lawyer chose not to answer it


class MemoHeader(ResponseModel):
    to: str | None = None
    from_: str | None = Field(default=None, alias="from")
    re: str | None = None

    model_config = {"populate_by_name": True, "from_attributes": True}


class DraftCreate(RequestModel):
    """Start a draft directly, e.g. from "Draft a reply…" on a document (decision 4)."""

    type: DraftType
    incoming_document_id: str
    supporting_document_ids: list[str] = Field(default_factory=list, max_length=50)
    instructions: str = Field(default="", max_length=8000)
    conversation_id: str | None = None


class DraftAccepted(ResponseModel):
    draft_id: str
    job_id: str


class ProposalRequest(RequestModel):
    instruction: str = Field(min_length=1, max_length=2000)


class SectionProposalOut(ResponseModel):
    """A rewrite shown before it is applied (decision 3). Nothing changes until PATCH accepts `proposal_id`."""

    proposal_id: str
    section_id: str
    base_version: int
    body: str
    diff: list[dict[str, str]]


class ClaimProposalOut(ResponseModel):
    """A new section answering a claim the draft doesn't answer yet. Accepted the same way."""

    proposal_id: str
    claim_id: str
    base_version: int
    section: DraftSectionOut


class DraftListItem(ResponseModel):
    """A draft in the matter's list; GET /drafts/{id} has the text."""

    id: str
    type: DraftType
    title: str
    status: Literal["generating", "not_reviewed", "reviewed_adopted", "failed"]
    incoming_document_id: str | None = None
    incoming_document_name: str | None = None
    conversation_id: str | None = None
    version: int
    reviewed_at: Timestamp | None = None
    created_at: Timestamp
    updated_at: Timestamp


class DraftOut(ResponseModel):
    id: str
    matter_id: str
    conversation_id: str | None = None
    type: DraftType
    title: str
    incoming_document_id: str | None = None
    supporting_document_ids: list[str]
    status: Literal["generating", "not_reviewed", "reviewed_adopted", "failed"]
    job_id: str | None = None  # the generation job, so the UI can cancel it
    watermark: str | None = None
    reviewed_at: Timestamp | None = None
    version: int
    is_current: bool = True
    sections: list[DraftSectionOut]
    placeholders: list[PlaceholderOut]
    safeguards: SafeguardsOut
    versions: list[VersionInfo]
    last_diff: dict[str, object] | None = None
    claims: list[ClaimOut] = Field(default_factory=list)
    acknowledged: list[str] = Field(default_factory=list)  # checklist item ids the lawyer acknowledged
    added_authorities: list[str] = Field(default_factory=list)  # sources the lawyer named
    date_line: str | None = None
    memo_header: MemoHeader | None = None
    model_id: str | None = None
    prompt_version: str | None = None
    created_at: Timestamp
    updated_at: Timestamp


class SectionPatch(RequestModel):
    id: str
    heading: str | None = Field(default=None, max_length=300)
    content: str | None = Field(default=None, max_length=50_000)


class SafeguardsPatch(RequestModel):
    fre408_header: bool | None = None
    reservation_of_rights: bool | None = None


class DraftPatch(RequestModel):
    base_version: int
    sections: list[SectionPatch] | None = None
    safeguards: SafeguardsPatch | None = None
    acknowledge: list[str] | None = Field(default=None, description="Citation-checklist item ids to acknowledge.")
    unacknowledge: list[str] | None = Field(default=None, description="Item ids to un-tick.")
    restore_version: int | None = None
    accept_proposal: str | None = Field(default=None, description="Apply a rewrite or claim-response preview.")
    waived_claims: list[str] | None = Field(
        default=None, max_length=100, description="Every claim the lawyer sets aside (replaces the list)."
    )
    added_authorities: list[Annotated[str, Field(min_length=1, max_length=300)]] | None = Field(
        default=None, max_length=100, description="Every source the lawyer named (replaces the list)."
    )
    version_label: str | None = Field(default=None, max_length=200, description="Label for the version an edit makes.")


class RegenerateRequest(RequestModel):
    instruction: str = Field(min_length=1, max_length=2000)


class ReviewRequest(RequestModel):
    confirm: Literal[True]


class PointCheck(ResponseModel):
    claim_id: str
    claim: str
    source: InlineCitation | None = None
    status: ClaimStatus
    section_ids: list[str]


class ChecklistItem(ResponseModel):
    id: str
    authority: str
    kind: Literal["case", "statute", "rule", "regulation"]
    status: ChecklistStatus
    unverified: bool
    supporting: InlineCitation | None = None
    section_ids: list[str]
    acknowledged: bool
    note: str


class ExportGate(ResponseModel):
    clean_allowed: bool
    blockers: list[dict[str, str]]


class DraftChecksOut(ResponseModel):
    draft_id: str
    version: int
    point_by_point: list[PointCheck]
    citation_checklist: list[ChecklistItem]
    placeholders: list[PlaceholderOut]
    export: ExportGate
