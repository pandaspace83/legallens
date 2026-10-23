"""Drafts: start, versions, checks, review and export (DEC-43 to DEC-51)."""

import copy
import difflib
import hashlib
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from legallens.db.models import Chunk, Document, Draft, DraftVersion, Export, Matter, User
from legallens.drafting import authorities, checks, placeholders, templates
from legallens.drafting.docx_export import ExportVerificationError, build
from legallens.errors import ApiError
from legallens.ids import new_id
from legallens.jobs.queue import enqueue
from legallens.models.embedder import Embedder
from legallens.orchestrator.base import RefineResult
from legallens.orchestrator.stub.orchestrator import MODEL_ID, PROMPT_VERSION
from legallens.schemas.common import InlineCitation
from legallens.schemas.drafts import (
    Addressee,
    ClaimOut,
    ClaimProposalOut,
    DraftChecksOut,
    DraftListItem,
    DraftOut,
    DraftPatch,
    DraftSectionOut,
    ExportGate,
    MemoHeader,
    PlaceholderOut,
    SafeguardsOut,
    SectionProposalOut,
    VersionInfo,
)
from legallens.search.hybrid import hybrid_search
from legallens.services import audit, matters
from legallens.timeutil import utcnow

WATERMARK = "AI draft · not reviewed"
TYPE_TITLES = {"response_letter": "Response letter", "memo": "Memo"}
MAX_PROPOSALS = 20  # previews kept per draft; older ones expire


def _today() -> str:
    today = datetime.now().date()  # the lawyer's local date, as written on the letter
    return f"{today:%B} {today.day}, {today.year}"


# ---------------------------------------------------------------- start and generate


def start(
    db: Session,
    *,
    user_id: str,
    matter: Matter,
    draft_type: str,
    incoming: Document,
    supporting_ids: list[str],
    instructions: str,
    conversation_id: str | None,
) -> tuple[Draft, str]:
    if incoming.status != "ready":
        raise ApiError(409, "document_not_ready", "The document you're responding to is still being processed.")
    addressee, reminder = templates.addressee_for(matter.profile_json or {})
    draft = Draft(
        id=new_id("draft"),
        matter_id=matter.id,
        conversation_id=conversation_id,
        type=draft_type,
        title=f"{TYPE_TITLES[draft_type]}: {incoming.filename}",
        incoming_document_id=incoming.id,
        supporting_document_ids_json=list(dict.fromkeys(supporting_ids)),
        instructions=instructions,
        date_line=_today(),
        status="generating",
        safeguards_json={
            "addressee": addressee,
            "rule_4_3_reminder": reminder,
            "fre408_header": False,
            "reservation_of_rights": False,
        },
    )
    db.add(draft)
    db.flush()
    job = enqueue(db, matter_id=matter.id, kind="draft", payload={"draft_id": draft.id}, max_attempts=2)
    draft.job_id = job.id
    audit.append(
        db,
        action="generate",
        entity_type="draft",
        entity_id=draft.id,
        user_id=user_id,
        matter_id=matter.id,
        details={"type": draft_type, "incoming_document_id": incoming.id, "job_id": job.id},
    )
    return draft, job.id


def _chunks(db: Session, document_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Chunk, Document.filename)
        .join(Document, Document.id == Chunk.document_id)
        .where(Chunk.document_id == document_id, Chunk.kind != "section")
        .order_by(Chunk.seq)
    ).all()
    return [
        {
            "chunk_id": c.id,
            "document_id": c.document_id,
            "document_name": filename,
            "text": c.text,
            "page": c.page_start,
            "para_ref": c.para_ref,
            "bbox": c.bbox_json,
            "seq": c.seq,
        }
        for c, filename in rows
    ]


def generate(db: Session, draft: Draft, embedder: Embedder) -> DraftVersion:
    """The template drafter in one transaction (no model involved)."""
    return finish(db, draft, compose(db, draft, embedder))


def compose(
    db: Session,
    draft: Draft,
    embedder: Embedder,
    respond: templates.Respond | None = None,
    narrate: templates.Respond | None = None,
) -> dict[str, Any]:
    """The draft's content. Reads only, so the job can run it (and any model calls in `respond`) outside the
    write transaction; `finish` then saves it."""
    matter = db.get(Matter, draft.matter_id)
    incoming = db.get(Document, draft.incoming_document_id) if draft.incoming_document_id else None
    if matter is None or incoming is None:
        raise ApiError(409, "document_missing", "The document this draft responds to was deleted.")
    supporting = draft.supporting_document_ids_json or None

    def find_facts(text: str) -> list[dict[str, Any]]:
        if not supporting:
            return []
        result = hybrid_search(db, embedder, matter_id=draft.matter_id, query=text, document_ids=supporting, k_fused=3)
        return [
            {
                "chunk_id": h.chunk_id,
                "document_id": h.document_id,
                "document_name": h.document_name,
                "text": h.text,
                "page": h.page_start,
                "para_ref": h.para_ref,
                "bbox": h.bbox,
            }
            for h in result.hits
            if h.bm25_rank is not None
        ]

    def find_in_incoming(text: str) -> list[dict[str, Any]]:
        result = hybrid_search(
            db, embedder, matter_id=draft.matter_id, query=text, document_ids=[incoming.id], k_fused=6
        )
        return [
            {
                "chunk_id": h.chunk_id,
                "document_id": h.document_id,
                "document_name": h.document_name,
                "text": h.text,
                "page": h.page_start,
                "para_ref": h.para_ref,
                "bbox": h.bbox,
                "seq": h.seq,
            }
            for h in result.hits
            if h.kind != "section"
        ]

    matter_info = {"name": matter.name, "client_name": matter.client_name}
    # The signer is the lawyer who owns the matter; their name is known, so it is not left as a placeholder.
    owner = db.get(User, matter.owner_user_id)
    author = owner.name if owner and owner.name.strip() else "[ATTORNEY NAME]"
    incoming_chunks = _chunks(db, incoming.id)
    if draft.type == "memo":
        content = templates.memo(
            matter=matter_info,
            incoming_name=incoming.filename,
            incoming_chunks=incoming_chunks,
            find_facts=find_facts,
            instructions=draft.instructions or "",
            author=author,
            narrate=narrate,
            find_in_incoming=find_in_incoming,
        )
    else:
        content = templates.response_letter(
            matter=matter_info,
            incoming_name=incoming.filename,
            incoming_chunks=incoming_chunks,
            find_facts=find_facts,
            addressee=(draft.safeguards_json or {}).get("addressee"),
            author=author,
            respond=respond,
        )
    return content


def finish(
    db: Session,
    draft: Draft,
    content: dict[str, Any],
    *,
    model_id: str = MODEL_ID,
    prompt_version: str = PROMPT_VERSION,
) -> DraftVersion:
    version = save_version(db, draft, content, source="ai", label="AI draft")
    draft.status = "not_reviewed"
    draft.model_id, draft.prompt_version = model_id, prompt_version
    return version


# ---------------------------------------------------------------- versions


def current(db: Session, draft: Draft) -> DraftVersion | None:
    if draft.current_version == 0:
        return None
    return db.execute(
        select(DraftVersion).where(DraftVersion.draft_id == draft.id, DraftVersion.version == draft.current_version)
    ).scalar_one_or_none()


def _compute_checks(db: Session, draft: Draft, content: dict[str, Any]) -> dict[str, Any]:
    sections = content.get("sections", [])
    found = placeholders.scan_sections(sections)
    matter = db.get(Matter, draft.matter_id)
    items = checks.checklist(
        db,
        draft.matter_id,
        sections,
        draft.acknowledgments_json or {},
        matter.name if matter else None,
        added=draft.added_authorities_json or [],
    )
    return {
        "point_by_point": checks.point_by_point(content, draft.waived_claims_json or []),
        "citation_checklist": items,
        "placeholders": found,
    }


def save_version(
    db: Session,
    draft: Draft,
    content: dict[str, Any],
    *,
    source: str,
    label: str = "",
    diff: dict[str, Any] | None = None,
) -> DraftVersion:
    content = copy.deepcopy(content)
    matter = db.get(Matter, draft.matter_id)
    keys = checks.unverified_keys(db, draft.matter_id, content.get("sections", []), matter.name if matter else None)
    for section in content.get("sections", []):
        section["content"] = authorities.wrap_unverified(section.get("content", ""), keys)
    version_no = draft.current_version + 1
    version = DraftVersion(
        id=new_id("draft_version"),
        matter_id=draft.matter_id,
        draft_id=draft.id,
        version=version_no,
        source=source,
        label=label[:200],
        content_json=content,
        checks_json=_compute_checks(db, draft, content),
        diff_json=diff,
    )
    db.add(version)
    draft.current_version = version_no
    draft.updated_at = utcnow()
    if draft.status == "reviewed_adopted":
        draft.status = "not_reviewed"  # an edit after adoption needs a new review (DEC-51)
        draft.reviewed_at = None
    matter = db.get(Matter, draft.matter_id)
    if matter:
        matters.touch(matter)
    db.flush()
    return version


def _section_diff(section_id: str, before: str, after: str) -> dict[str, Any]:
    a, b = before.split(" "), after.split(" ")
    ops = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag == "equal":
            ops.append({"op": "equal", "text": " ".join(a[i1:i2])})
        if tag in ("delete", "replace"):
            ops.append({"op": "delete", "text": " ".join(a[i1:i2])})
        if tag in ("insert", "replace"):
            ops.append({"op": "insert", "text": " ".join(b[j1:j2])})
    return {"section_id": section_id, "before": before, "after": after, "ops": ops}


def rewrite_section(
    db: Session, draft: Draft, section_id: str, instruction: str, *, source: str, label: str | None = None
) -> DraftVersion:
    version = current(db, draft)
    if version is None:
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    content = copy.deepcopy(version.content_json)
    section = next((s for s in content["sections"] if s["id"] == section_id), None)
    if section is None:
        raise ApiError(404, "not_found", "Section not found.")
    before = section["content"]
    section["content"] = templates.stub_rewrite(section, instruction)
    section["origin"] = "ai"
    return save_version(
        db,
        draft,
        content,
        source=source,
        label=label or f"Rewrote “{section.get('heading', '')}”: {instruction}",
        diff=_section_diff(section_id, before, section["content"]),
    )


def refine_from_chat(db: Session, user_id: str, draft: Draft, instruction: str) -> RefineResult:
    version = current(db, draft)
    if version is None:
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    section = templates.pick_section(version.content_json["sections"], instruction)
    new_version = rewrite_section(
        db, draft, section["id"], instruction, source="regenerate", label=f"From the chat: {instruction}"
    )
    audit.append(
        db,
        action="generate",
        entity_type="draft",
        entity_id=draft.id,
        user_id=user_id,
        matter_id=draft.matter_id,
        details={"section_id": section["id"], "version": new_version.version, "via": "chat"},
    )
    return RefineResult(draft.id, section["id"], section["heading"], new_version.version)


def _ready_version(db: Session, draft: Draft) -> DraftVersion:
    version = current(db, draft)
    if version is None or draft.status in ("generating", "failed"):
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    return version


def _unadopt(draft: Draft) -> None:
    """The letter changed after the lawyer adopted it, so it needs a new review (DEC-51)."""
    if draft.status == "reviewed_adopted":
        draft.status = "not_reviewed"
        draft.reviewed_at = None


def _apply_proposal(db: Session, draft: Draft, version: DraftVersion, proposal_id: str, label: str | None) -> None:
    proposals = dict(draft.proposals_json or {})
    proposal = proposals.pop(proposal_id, None)
    if proposal is None:
        raise ApiError(404, "not_found", "That preview no longer exists. Ask for it again.")
    if proposal["base_version"] != draft.current_version:
        raise ApiError(409, "proposal_stale", "The draft changed after this preview was made. Ask for it again.")
    content = copy.deepcopy(version.content_json)
    sections = content["sections"]
    if proposal["kind"] == "rewrite":
        section = next((s for s in sections if s["id"] == proposal["section_id"]), None)
        if section is None:
            raise ApiError(404, "not_found", "Section not found.")
        before = section["content"]
        section["content"] = proposal["body"]
        section["origin"] = "ai"
        save_version(
            db,
            draft,
            content,
            source="regenerate",
            label=label or f"Rewrote “{section.get('heading', '')}”: {proposal['instruction']}",
            diff=_section_diff(section["id"], before, section["content"]),
        )
    else:
        new_section = proposal["section"]
        at = next((i for i, s in enumerate(sections) if s.get("kind") == "closing"), len(sections))
        sections.insert(at, new_section)
        claim = next((c for c in content.get("claims", []) if c["id"] == proposal["claim_id"]), None)
        waived = [c for c in draft.waived_claims_json or [] if c != proposal["claim_id"]]
        draft.waived_claims_json = waived  # answering a point undoes setting it aside
        summary = " ".join((claim or {}).get("text", "").split()[:10])
        save_version(db, draft, content, source="regenerate", label=label or f"Answered: {summary}")
    draft.proposals_json = proposals


def patch(db: Session, user_id: str, draft: Draft, body: DraftPatch) -> Draft:
    if draft.status in ("generating", "failed"):
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    if body.base_version != draft.current_version:
        raise ApiError(
            409,
            "version_conflict",
            "The draft changed since you loaded it. Reload it and apply your edit again.",
            current_version=draft.current_version,
        )
    text_changes = [x for x in (body.sections, body.restore_version, body.accept_proposal) if x not in (None, [])]
    if len(text_changes) > 1:
        raise ApiError(422, "invalid_option", "Send only one of sections, restore_version or accept_proposal.")
    changed: list[str] = []
    version = current(db, draft)
    if body.acknowledge or body.unacknowledge:
        acks = dict(draft.acknowledgments_json or {})
        for item_id in body.acknowledge or []:
            acks[item_id] = {"at": utcnow().isoformat(), "by": user_id}
        for item_id in body.unacknowledge or []:
            acks.pop(item_id, None)
        draft.acknowledgments_json = acks
        changed.append("acknowledge")
    if body.waived_claims is not None:
        known = {c["id"] for c in (version.content_json if version else {}).get("claims", [])}
        unknown = [c for c in body.waived_claims if c not in known]
        if unknown:
            raise ApiError(422, "unknown_claim", "Some claims don't exist in this draft.", claim_ids=unknown)
        draft.waived_claims_json = list(dict.fromkeys(body.waived_claims))
        changed.append("waived_claims")
    if body.added_authorities is not None:
        named = [" ".join(a.split()) for a in body.added_authorities]
        draft.added_authorities_json = list(dict.fromkeys(a for a in named if a))
        changed.append("added_authorities")
    if body.safeguards is not None:
        safeguards = dict(draft.safeguards_json or {})
        updates = body.safeguards.model_dump(exclude_none=True)
        if any(safeguards.get(key) != value for key, value in updates.items()):
            _unadopt(draft)  # the header and the closing are part of the letter that goes out
        safeguards.update(updates)
        draft.safeguards_json = safeguards
        changed.append("safeguards")
    if version is not None and body.restore_version is not None:
        old = db.execute(
            select(DraftVersion).where(DraftVersion.draft_id == draft.id, DraftVersion.version == body.restore_version)
        ).scalar_one_or_none()
        if old is None:
            raise ApiError(404, "not_found", "That version doesn't exist.")
        save_version(
            db,
            draft,
            old.content_json,
            source="restore",
            label=body.version_label or f"Restored version {old.version}",
        )
        changed.append("restore")
    elif version is not None and body.accept_proposal is not None:
        _apply_proposal(db, draft, version, body.accept_proposal, body.version_label)
        changed.append("accept_proposal")
    elif version is not None and body.sections:
        content = copy.deepcopy(version.content_json)
        by_id = {s["id"]: s for s in content["sections"]}
        unknown = [s.id for s in body.sections if s.id not in by_id]
        if unknown:
            raise ApiError(422, "unknown_section", "Some sections don't exist in this draft.", section_ids=unknown)
        for edit in body.sections:
            section = by_id[edit.id]
            if edit.heading is not None:
                section["heading"] = edit.heading
            if edit.content is not None:
                section["content"] = edit.content
            section["origin"] = "lawyer"
        save_version(db, draft, content, source="lawyer", label=body.version_label or "Edited by you")
        changed.append("sections")
    elif changed and version is not None:
        # Acknowledgements, set-aside claims and named sources change the checks, not the text: refresh the stored
        # checks without a new version.
        version.checks_json = _compute_checks(db, draft, version.content_json)
    draft.updated_at = utcnow()
    if changed:
        audit.append(
            db,
            action="edit",
            entity_type="draft",
            entity_id=draft.id,
            user_id=user_id,
            matter_id=draft.matter_id,
            details={"changes": changed, "version": draft.current_version},
        )
    return draft


def review(db: Session, user_id: str, draft: Draft) -> Draft:
    if draft.status in ("generating", "failed"):
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    if draft.status != "reviewed_adopted":
        # Adopting means the lawyer stands behind every word, so nothing else may be open (DEC-51; the frontend's
        # rule, enforced here so the screen never decides it).
        open_items = [b for b in checks_out(db, draft).export.blockers if b["code"] != "not_reviewed"]
        if open_items:
            raise ApiError(
                409,
                "review_blocked",
                "Resolve these first: " + " ".join(b["message"] for b in open_items),
                blockers=open_items,
            )
        draft.status = "reviewed_adopted"
        draft.reviewed_at = utcnow()
        audit.append(
            db,
            action="review",
            entity_type="draft",
            entity_id=draft.id,
            user_id=user_id,
            matter_id=draft.matter_id,
            details={"version": draft.current_version},
        )
    return draft


# ---------------------------------------------------------------- previews (decision 3)


def _keep(draft: Draft, proposal: dict[str, Any]) -> None:
    proposals = dict(draft.proposals_json or {})
    proposals[proposal["id"]] = proposal
    for stale in sorted(proposals)[: max(0, len(proposals) - MAX_PROPOSALS)]:
        proposals.pop(stale)  # ids sort by creation time
    draft.proposals_json = proposals


def propose_rewrite(db: Session, user_id: str, draft: Draft, section_id: str, instruction: str) -> SectionProposalOut:
    """A rewrite of one section, shown before it is applied (DEC-44, decision 3). Nothing changes until PATCH
    accepts it, so the lawyer can compare and decline."""
    version = _ready_version(db, draft)
    section = next((s for s in version.content_json["sections"] if s["id"] == section_id), None)
    if section is None:
        raise ApiError(404, "not_found", "Section not found.")
    body = templates.stub_rewrite(section, instruction)
    proposal: dict[str, Any] = {
        "id": new_id("proposal"),
        "kind": "rewrite",
        "base_version": draft.current_version,
        "section_id": section_id,
        "instruction": " ".join(instruction.split()),
        "body": body,
    }
    _keep(draft, proposal)
    audit.append(
        db,
        action="generate",
        entity_type="draft",
        entity_id=draft.id,
        user_id=user_id,
        matter_id=draft.matter_id,
        details={"proposal_id": proposal["id"], "section_id": section_id, "kind": "rewrite"},
    )
    return SectionProposalOut(
        proposal_id=proposal["id"],
        section_id=section_id,
        base_version=draft.current_version,
        body=body,
        diff=_section_diff(section_id, section["content"], body)["ops"],
    )


def propose_claim_response(db: Session, user_id: str, draft: Draft, claim_id: str) -> ClaimProposalOut:
    """A new section answering a claim the draft doesn't answer (DEC-47), shown before it is added."""
    version = _ready_version(db, draft)
    claim = next((c for c in version.content_json.get("claims", []) if c["id"] == claim_id), None)
    if claim is None:
        raise ApiError(404, "not_found", "Claim not found.")
    section = templates.claim_response(claim, version.content_json["sections"])
    proposal: dict[str, Any] = {
        "id": new_id("proposal"),
        "kind": "claim",
        "base_version": draft.current_version,
        "claim_id": claim_id,
        "section": section,
    }
    _keep(draft, proposal)
    audit.append(
        db,
        action="generate",
        entity_type="draft",
        entity_id=draft.id,
        user_id=user_id,
        matter_id=draft.matter_id,
        details={"proposal_id": proposal["id"], "claim_id": claim_id, "kind": "claim"},
    )
    return ClaimProposalOut(
        proposal_id=proposal["id"],
        claim_id=claim_id,
        base_version=draft.current_version,
        section=_section_out(section),
    )


# ---------------------------------------------------------------- read models


def _section_out(section: dict[str, Any]) -> DraftSectionOut:
    return DraftSectionOut(
        id=section["id"],
        heading=section.get("heading", ""),
        content=section.get("content", ""),
        citations=[InlineCitation.model_validate(c) for c in section.get("citations", [])],
        origin=section.get("origin", "ai"),
        claim_ids=section.get("claim_ids", []),
        kind=section.get("kind"),
        show_heading=section.get("show_heading", True),
    )


def _memo_header(sections: list[dict[str, Any]]) -> MemoHeader | None:
    """The memo's To / From / Re lines, read from its header section so the lawyer's edits show up here."""
    head = next((s for s in sections if s.get("kind") == "memo_header"), None)
    if head is None:
        return None
    fields: dict[str, str | None] = {}
    for line in head.get("content", "").splitlines():
        key, _, value = line.partition(":")
        if key.strip().lower() in ("to", "from", "re"):
            fields[key.strip().lower()] = value.strip() or None
    return MemoHeader.model_validate(fields)


def _claims(points: list[dict[str, Any]], waived: list[str]) -> list[ClaimOut]:
    return [
        ClaimOut(
            id=p["claim_id"],
            text=p["claim"],
            source=InlineCitation.model_validate(p["source"]) if p.get("source") else None,
            status=p["status"],
            addressed_by=p["section_ids"][0] if p["section_ids"] else None,
            waived=p["claim_id"] in waived,
        )
        for p in points
    ]


def list_item(draft: Draft, incoming_name: str | None) -> DraftListItem:
    return DraftListItem(
        id=draft.id,
        type=draft.type,  # type: ignore[arg-type]
        title=draft.title,
        status=draft.status,  # type: ignore[arg-type]
        incoming_document_id=draft.incoming_document_id,
        incoming_document_name=incoming_name,
        conversation_id=draft.conversation_id,
        version=draft.current_version,
        reviewed_at=draft.reviewed_at,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


def to_out(db: Session, draft: Draft, version_no: int | None = None) -> DraftOut:
    versions = list(
        db.execute(
            select(DraftVersion).where(DraftVersion.draft_id == draft.id).order_by(DraftVersion.version)
        ).scalars()
    )
    if version_no is not None:
        version = next((v for v in versions if v.version == version_no), None)
        if version is None:
            raise ApiError(404, "not_found", "That version doesn't exist.")
    else:
        version = versions[-1] if versions else None
    content = version.content_json if version else {"sections": []}
    safeguards = draft.safeguards_json or {}
    addressee = safeguards.get("addressee")
    waived = draft.waived_claims_json or []
    return DraftOut(
        id=draft.id,
        matter_id=draft.matter_id,
        conversation_id=draft.conversation_id,
        type=draft.type,  # type: ignore[arg-type]
        title=draft.title,
        incoming_document_id=draft.incoming_document_id,
        supporting_document_ids=draft.supporting_document_ids_json or [],
        status=draft.status,  # type: ignore[arg-type]
        job_id=draft.job_id,
        watermark=None if draft.status == "reviewed_adopted" else WATERMARK,
        reviewed_at=draft.reviewed_at,
        version=version.version if version else 0,
        is_current=(version is None or version.version == draft.current_version),
        sections=[_section_out(s) for s in content.get("sections", [])],
        placeholders=[PlaceholderOut.model_validate(p) for p in (version.checks_json or {}).get("placeholders", [])]
        if version
        else [],
        safeguards=SafeguardsOut(
            addressee=Addressee.model_validate(addressee) if addressee else None,
            rule_4_3_reminder=bool(safeguards.get("rule_4_3_reminder")),
            fre408_header=bool(safeguards.get("fre408_header")),
            reservation_of_rights=bool(safeguards.get("reservation_of_rights")),
        ),
        versions=[
            VersionInfo(version=v.version, source=v.source, label=v.label or "", created_at=v.created_at)  # type: ignore[arg-type]
            for v in versions
        ],
        last_diff=version.diff_json if version else None,
        claims=_claims(checks.point_by_point(content, waived), waived),
        acknowledged=sorted((draft.acknowledgments_json or {}).keys()),
        added_authorities=list(draft.added_authorities_json or []),
        date_line=draft.date_line,
        memo_header=_memo_header(content.get("sections", [])),
        model_id=draft.model_id,
        prompt_version=draft.prompt_version,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


def checks_out(db: Session, draft: Draft) -> DraftChecksOut:
    version = current(db, draft)
    computed = _compute_checks(db, draft, version.content_json) if version else {}
    items = computed.get("citation_checklist", [])
    found = computed.get("placeholders", [])
    return DraftChecksOut(
        draft_id=draft.id,
        version=draft.current_version,
        point_by_point=computed.get("point_by_point", []),
        citation_checklist=items,
        placeholders=found,
        export=ExportGate.model_validate(
            checks.export_gate(draft.status, found, items, computed.get("point_by_point", []))
        ),
    )


# ---------------------------------------------------------------- export


def export(db: Session, user_id: str, draft: Draft, kind: str) -> tuple[bytes, str]:
    if draft.status in ("generating", "failed"):
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    version = current(db, draft)
    if version is None:
        raise ApiError(409, "draft_not_ready", "The draft is not ready yet.")
    if kind == "clean":
        gate = checks_out(db, draft).export
        if not gate.clean_allowed:
            raise ApiError(409, "export_blocked", "The clean copy can't be exported yet.", blockers=gate.blockers)
    matter = db.get(Matter, draft.matter_id)
    payload = {
        "type": draft.type,
        "status": draft.status,
        "sections": version.content_json.get("sections", []),
        "safeguards": draft.safeguards_json or {},
        "date_line": draft.date_line,
    }
    try:
        data = build(payload, kind=kind, client_name=matter.client_name if matter else "our client")
    except ExportVerificationError as exc:
        raise ApiError(
            500, "export_verification_failed", "The export failed its safety check and was not produced."
        ) from exc
    digest = hashlib.sha256(data).hexdigest()
    db.add(
        Export(
            id=new_id("export"),
            matter_id=draft.matter_id,
            draft_id=draft.id,
            kind=kind,
            version=version.version,
            sha256=digest,
        )
    )
    audit.append(
        db,
        action="export",
        entity_type="draft",
        entity_id=draft.id,
        user_id=user_id,
        matter_id=draft.matter_id,
        details={"kind": kind, "version": version.version, "sha256": digest},
    )
    slug = draft.type.replace("_", "-")
    suffix = "" if kind == "clean" else "-working-copy"
    return data, f"{slug}-v{version.version}{suffix}.docx"
