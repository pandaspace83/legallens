"""Draft checks: the citation checklist (DEC-49), the point-by-point response check (DEC-47) and the export gate
(DEC-50, DEC-51)."""

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from legallens.db.models import Chunk, Document
from legallens.drafting import authorities, placeholders
from legallens.search.fts import build_fts_query
from legallens.search.hybrid import sparse_leg

LATER_HISTORY_NOTE = "Later history not checked. Confirm it is still good law in your citator."
CAPTION_CHARS = 400  # where a court opinion or statute names itself
_OPINION_MARKERS = re.compile(
    r"\b(opinion|court of appeals|supreme court|district court|circuit judge|appellant|appellee|petitioner|"
    r"respondent|before|affirmed|reversed|remanded|argued|decided|filed)\b",
    re.I,
)
_STATUTE_MARKERS = re.compile(r"\b(code|statute|act|title|chapter|section|§|regulation|rule)\b", re.I)


def _citation(chunk: Chunk, filename: str, quote_len: int = 280) -> dict[str, Any]:
    return {
        "n": 0,
        "chunk_id": chunk.id,
        "document_id": chunk.document_id,
        "document_name": filename,
        "page": chunk.page_start,
        "para_ref": chunk.para_ref,
        "quote": " ".join(chunk.text.split())[:quote_len],
        "bbox": chunk.bbox_json,
    }


def _opening(db: Session, document_id: str) -> str:
    first = db.execute(
        select(Chunk.text).where(Chunk.document_id == document_id, Chunk.kind != "section").order_by(Chunk.seq).limit(1)
    ).scalar()
    return first or ""


def _is_the_authority(db: Session, authority: authorities.Authority, document: Document) -> bool:
    """A document *is* the authority when its file name names it, or its opening names it and reads like a court
    opinion (for a case) or a statute or rule (otherwise). A letter that merely cites a case early on is not it."""
    core = authorities.normalise(authority.core)
    if core and core in authorities.normalise(document.filename):
        return True
    opening = _opening(db, document.id)
    if core not in authorities.normalise(opening[:CAPTION_CHARS]):
        return False
    markers = _OPINION_MARKERS if authority.kind == "case" else _STATUTE_MARKERS
    return bool(markers.search(opening[:1500]))


def classify(db: Session, matter_id: str, authority: authorities.Authority) -> tuple[str, dict[str, Any] | None]:
    """full_text_uploaded if a document in the matter *is* this authority; only_mentioned if documents only cite
    it (e.g. opposing counsel's letter, RISK-02); otherwise not_in_documents."""
    fts_query = build_fts_query(f'"{authority.core}"')
    if not fts_query:
        return "not_in_documents", None
    core_tokens = authorities.normalise(authority.core).split()
    best_mention: tuple[Chunk, str] | None = None
    for chunk_id, _score in sparse_leg(db, matter_id=matter_id, fts_query=fts_query, document_ids=None, k=20):
        chunk = db.get(Chunk, chunk_id)
        if chunk is None:
            continue
        text = authorities.normalise(chunk.text + " " + chunk.header)
        if not all(token in text.split() for token in core_tokens):
            continue
        document = db.get(Document, chunk.document_id)
        if document is None:
            continue
        if _is_the_authority(db, authority, document):
            return "full_text_uploaded", _citation(chunk, document.filename)
        best_mention = best_mention or (chunk, document.filename)
    if best_mention:
        return "only_mentioned", _citation(*best_mention)
    return "not_in_documents", None


def _own_case(authority: authorities.Authority, matter_name: str | None) -> bool:
    """The matter's own caption ("Smith v. Acme Corp") is not authority, so it is never listed."""
    return bool(matter_name) and authorities.normalise(authority.core) == authorities.normalise(matter_name or "")


def checklist(
    db: Session,
    matter_id: str,
    sections: list[dict[str, Any]],
    acknowledged: dict[str, Any],
    matter_name: str | None = None,
    added: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Every legal authority in the draft. Sources the lawyer named (`added`) join the list only when they are
    legal authority; a named fact source, such as an incident log, is evidence and is not listed (decision 1)."""
    items: dict[str, dict[str, Any]] = {}
    for section in sections:
        for authority in authorities.find(section.get("content", "")):
            if _own_case(authority, matter_name):
                continue
            item = items.get(authority.item_id)
            if item is None:
                status, supporting = classify(db, matter_id, authority)
                if status != "full_text_uploaded" and section.get("origin") == "lawyer":
                    status = "added_by_lawyer"
                item = {
                    "id": authority.item_id,
                    "authority": authority.text,
                    "kind": authority.kind,
                    "status": status,
                    "unverified": status != "full_text_uploaded",
                    "supporting": supporting,
                    "section_ids": [],
                    "acknowledged": authority.item_id in acknowledged,
                    "note": LATER_HISTORY_NOTE,
                }
                items[authority.item_id] = item
            if section["id"] not in item["section_ids"]:
                item["section_ids"].append(section["id"])
    for text in added or []:
        for authority in authorities.find(text):
            if _own_case(authority, matter_name) or authority.item_id in items:
                continue
            status, supporting = classify(db, matter_id, authority)
            items[authority.item_id] = {
                "id": authority.item_id,
                "authority": authority.text,
                "kind": authority.kind,
                "status": status if status == "full_text_uploaded" else "added_by_lawyer",
                "unverified": status != "full_text_uploaded",
                "supporting": supporting,
                "section_ids": [],
                "acknowledged": authority.item_id in acknowledged,
                "note": LATER_HISTORY_NOTE,
            }
    return list(items.values())


def unverified_keys(
    db: Session, matter_id: str, sections: list[dict[str, Any]], matter_name: str | None = None
) -> set[str]:
    """Authorities to show as [UNVERIFIED: …]: everything whose full text is not uploaded (DEC-48)."""
    keys: set[str] = set()
    seen: dict[str, str] = {}
    for section in sections:
        for authority in authorities.find(section.get("content", "")):
            if _own_case(authority, matter_name):
                continue
            if authority.key not in seen:
                seen[authority.key], _ = classify(db, matter_id, authority)
            if seen[authority.key] != "full_text_uploaded":
                keys.add(authority.key)
    return keys


def point_by_point(content: dict[str, Any], waived: list[str] | None = None) -> list[dict[str, Any]]:
    """Each claim: addressed, flagged (its section still has placeholders), missing, or waived (the lawyer chose
    not to answer it)."""
    sections = content.get("sections", [])
    out = []
    for claim in content.get("claims", []):
        mapped = [s for s in sections if claim["id"] in s.get("claim_ids", [])]
        if not mapped:
            status = "waived" if claim["id"] in (waived or []) else "missing"
        elif any(placeholders.blocking(placeholders.find(s.get("content", ""))) for s in mapped):
            status = "flagged"
        else:
            status = "addressed"
        out.append(
            {
                "claim_id": claim["id"],
                "claim": claim["text"],
                "source": claim.get("source"),
                "status": status,
                "section_ids": [s["id"] for s in mapped],
            }
        )
    return out


def export_gate(
    status: str,
    found_placeholders: list[dict[str, Any]],
    checklist_items: list[dict[str, Any]],
    points: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    blockers: list[dict[str, str]] = []
    if status in ("generating", "failed"):
        blockers.append({"code": "draft_not_ready", "message": "The draft is not ready yet."})
    remaining = placeholders.blocking(found_placeholders)
    if remaining:
        sample = ", ".join(dict.fromkeys(p["token"] for p in remaining[:3]))
        blockers.append(
            {"code": "placeholders", "message": f"{len(remaining)} placeholder(s) still need filling, e.g. {sample}."}
        )
    missing = [p for p in points or [] if p["status"] == "missing"]
    if missing:
        # Decision 2 (DEC-47, RISK-06): every point in the incoming letter is answered or deliberately set aside.
        blockers.append(
            {
                "code": "unanswered_claims",
                "message": f"Answer or set aside {len(missing)} point(s) the incoming letter makes.",
            }
        )
    pending = [i for i in checklist_items if not i["acknowledged"]]
    if pending:
        blockers.append(
            {
                "code": "unacknowledged_citations",
                "message": f"Acknowledge {len(pending)} citation(s) in the citation checklist.",
            }
        )
    if status != "reviewed_adopted":
        blockers.append({"code": "not_reviewed", "message": 'Mark the draft "Reviewed and adopted" first.'})
    return {"clean_allowed": not blockers, "blockers": blockers}
