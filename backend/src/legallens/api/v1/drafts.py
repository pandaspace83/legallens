"""G · Drafts: read, edit (a new version per edit), regenerate a section, checks, review, export."""

from typing import Literal

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from legallens.api.deps import CurrentUser, ReadDB, WriteDB, load_in_matter, load_matter
from legallens.db.models import Conversation, Document, Draft, Matter
from legallens.errors import ApiError
from legallens.jobs.queue import enqueue
from legallens.schemas.common import Page, problem_responses
from legallens.schemas.drafts import (
    ClaimProposalOut,
    DraftAccepted,
    DraftChecksOut,
    DraftCreate,
    DraftListItem,
    DraftOut,
    DraftPatch,
    ProposalRequest,
    RegenerateRequest,
    ReviewRequest,
    SectionProposalOut,
)
from legallens.schemas.jobs import JobAccepted
from legallens.services import audit
from legallens.services import drafts as svc

router = APIRouter(prefix="/drafts", tags=["G · Drafts"])
matter_router = APIRouter(tags=["G · Drafts"])  # routes under /matters/{id}

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@matter_router.get("/matters/{matter_id}/drafts", operation_id="listDrafts", responses=problem_responses(401, 403, 404))
def list_drafts(
    matter_id: str,
    me: CurrentUser,
    db: ReadDB,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
) -> Page[DraftListItem]:
    """The matter's drafts, newest first (INT-1.3)."""
    matter = load_matter(db, me, matter_id)
    stmt = (
        select(Draft, Document.filename)
        .outerjoin(Document, Document.id == Draft.incoming_document_id)
        .where(Draft.matter_id == matter.id)
    )
    if cursor:
        stmt = stmt.where(Draft.id < cursor)
    rows = db.execute(stmt.order_by(Draft.id.desc()).limit(limit + 1)).all()
    page = rows[:limit]
    return Page[DraftListItem](
        items=[svc.list_item(draft, name) for draft, name in page],
        next_cursor=page[-1][0].id if len(rows) > limit and page else None,
    )


@matter_router.post(
    "/matters/{matter_id}/drafts",
    status_code=202,
    operation_id="createDraft",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def create_draft(matter_id: str, body: DraftCreate, me: CurrentUser, db: WriteDB) -> DraftAccepted:
    """Starts a draft without a chat turn, e.g. from "Draft a reply…" on a document (decision 4). The draft is
    written as a background job; follow it on the matter's event stream."""
    matter: Matter = load_matter(db, me, matter_id, writable=True)
    incoming = db.get(Document, body.incoming_document_id)
    if incoming is None:
        raise ApiError(422, "invalid_option", "The document you're responding to is not in this matter.")
    wanted = [d for d in body.supporting_document_ids if d != incoming.id]
    found = set(db.execute(select(Document.id).where(Document.id.in_(wanted))).scalars()) if wanted else set()
    missing = [d for d in wanted if d not in found]
    if missing:
        raise ApiError(422, "invalid_option", "Some documents are not in this matter.", document_ids=missing)
    supporting = list(
        db.execute(select(Document.id).where(Document.id.in_(wanted), Document.status == "ready")).scalars()
    )
    if body.conversation_id and db.get(Conversation, body.conversation_id) is None:
        raise ApiError(422, "invalid_option", "That chat is not in this matter.")
    draft, job_id = svc.start(
        db,
        user_id=me.user.id,
        matter=matter,
        draft_type=body.type,
        incoming=incoming,
        supporting_ids=supporting,
        instructions=body.instructions,
        conversation_id=body.conversation_id,
    )
    db.commit()
    return DraftAccepted(draft_id=draft.id, job_id=job_id)


@router.get("/{draft_id}", operation_id="getDraft", responses=problem_responses(401, 403, 404))
def get_draft(draft_id: str, me: CurrentUser, db: ReadDB, version: int | None = Query(None, ge=1)) -> DraftOut:
    """The current version, or an older one for version history."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, label="Draft")
    return svc.to_out(db, draft, version)


@router.patch("/{draft_id}", operation_id="updateDraft", responses=problem_responses(401, 403, 404, 409, 422))
def update_draft(draft_id: str, body: DraftPatch, me: CurrentUser, db: WriteDB) -> DraftOut:
    """Lawyer edits (a new version), restoring a version, accepting a preview, safeguards switches, checklist
    acknowledgements, set-aside claims and named sources. `base_version` must be the version you loaded, or the
    edit is refused with 409 version_conflict. A change to the text or the safeguards after adoption returns the
    draft to "not reviewed" (DEC-51)."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, writable=True, label="Draft")
    svc.patch(db, me.user.id, draft, body)
    db.commit()
    return svc.to_out(db, draft)


@router.post(
    "/{draft_id}/sections/{section_id}/regenerate",
    status_code=202,
    operation_id="regenerateSection",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def regenerate_section(
    draft_id: str, section_id: str, body: RegenerateRequest, me: CurrentUser, db: WriteDB
) -> JobAccepted:
    """Regenerates one section as a background job; the result is a new version with a diff (DEC-44)."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, writable=True, label="Draft")
    version = svc.current(db, draft)
    if version is None or draft.status in ("generating", "failed"):
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    if not any(s["id"] == section_id for s in version.content_json.get("sections", [])):
        raise ApiError(404, "not_found", "Section not found.")
    job = enqueue(
        db,
        matter_id=draft.matter_id,
        kind="regenerate",
        payload={"draft_id": draft.id, "section_id": section_id, "instruction": body.instruction},
        max_attempts=2,
    )
    audit.append(
        db,
        action="generate",
        entity_type="draft",
        entity_id=draft.id,
        user_id=me.user.id,
        matter_id=draft.matter_id,
        details={"section_id": section_id, "job_id": job.id},
    )
    db.commit()
    return JobAccepted(job_id=job.id)


@router.post(
    "/{draft_id}/sections/{section_id}/propose",
    operation_id="proposeSectionRewrite",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def propose_section_rewrite(
    draft_id: str, section_id: str, body: ProposalRequest, me: CurrentUser, db: WriteDB
) -> SectionProposalOut:
    """A rewrite of one section as a preview with its diff (decision 3). Nothing changes until PATCH sends
    `accept_proposal`; a preview made before another change is refused with 409 proposal_stale."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, writable=True, label="Draft")
    proposal = svc.propose_rewrite(db, me.user.id, draft, section_id, body.instruction)
    db.commit()
    return proposal


@router.post(
    "/{draft_id}/claims/{claim_id}/propose",
    operation_id="proposeClaimResponse",
    responses=problem_responses(401, 403, 404, 409, 422),
)
def propose_claim_response(draft_id: str, claim_id: str, me: CurrentUser, db: WriteDB) -> ClaimProposalOut:
    """A new section answering a point the draft doesn't answer yet (DEC-47), as a preview. Accepted with PATCH
    `accept_proposal`, which adds it before the closing."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, writable=True, label="Draft")
    proposal = svc.propose_claim_response(db, me.user.id, draft, claim_id)
    db.commit()
    return proposal


@router.get("/{draft_id}/checks", operation_id="getDraftChecks", responses=problem_responses(401, 403, 404))
def get_checks(draft_id: str, me: CurrentUser, db: ReadDB) -> DraftChecksOut:
    """Point-by-point check (DEC-47), the citation checklist (DEC-49) and what still blocks a clean export."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, label="Draft")
    return svc.checks_out(db, draft)


@router.post("/{draft_id}/review", operation_id="reviewDraft", responses=problem_responses(401, 403, 404, 409, 422))
def review_draft(draft_id: str, body: ReviewRequest, me: CurrentUser, db: WriteDB) -> DraftOut:
    """Marks the draft "Reviewed and adopted" and records when (DEC-51). Removes the watermark. Refused with 409
    review_blocked while placeholders, unanswered points or unacknowledged citations remain."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, writable=True, label="Draft")
    svc.review(db, me.user.id, draft)
    db.commit()
    return svc.to_out(db, draft)


@router.post(
    "/{draft_id}/export",
    operation_id="exportDraft",
    response_class=Response,
    responses={200: {"content": {DOCX_MEDIA_TYPE: {}}}, **problem_responses(401, 403, 404, 409)},
)
def export_draft(
    draft_id: str, me: CurrentUser, db: WriteDB, kind: Literal["clean", "working"] = Query(...)
) -> Response:
    """Clean: what you send, blocked until it is safe (DEC-50). Working copy: with sources, stamped privileged."""
    draft, _ = load_in_matter(db, me, Draft, draft_id, label="Draft")
    data, filename = svc.export(db, me.user.id, draft, kind)
    db.commit()
    return Response(
        content=data,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "private, no-store"},
    )


__all__ = ["router", "select"]
