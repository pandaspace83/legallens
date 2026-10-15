"""E · Documents: upload, list, status and coverage, the original file, viewer pages, citations, delete."""

from typing import Literal

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select

from legallens.api.deps import AppSettings, CurrentUser, ReadDB, WriteDB, load_in_matter, load_matter
from legallens.db.models import DocPage, Document, Matter, MessageCitation
from legallens.errors import ApiError
from legallens.ingestion.scanner import get_scanner
from legallens.schemas.common import Page, problem_responses
from legallens.schemas.documents import (
    Block,
    CitationLocationOut,
    DeletionReport,
    DocumentDetailOut,
    DocumentOut,
    HiddenContentOut,
    HiddenItem,
    PageBlocks,
    PagesOut,
    UploadAccepted,
)
from legallens.services import audit, deletion
from legallens.services import documents as svc
from legallens.storage.files import open_store

router = APIRouter(tags=["E · Documents"])

HIDDEN_NOTICE_OTHER_PARTY = (
    "This document came from another party. Some states restrict reviewing an opponent's metadata, although ABA "
    "Formal Opinion 06-442 allows it, and Model Rule 4.4(b) requires promptly notifying the sender about material "
    "sent by mistake. LegalLens never shows this content to the AI."
)
HIDDEN_NOTICE_CLIENT = "Hidden content found in this document. LegalLens never shows it to the AI."


@router.post(
    "/matters/{matter_id}/documents",
    status_code=202,
    operation_id="uploadDocument",
    responses=problem_responses(401, 403, 404, 409, 413, 415, 422, 503),
)
def upload_document(
    matter_id: str,
    me: CurrentUser,
    db: WriteDB,
    settings: AppSettings,
    file: UploadFile = File(...),
    origin: Literal["client", "other_party"] = Form(..., description="Where the document came from (DEC-59)."),
) -> UploadAccepted:
    matter = load_matter(db, me, matter_id, writable=True)
    temp_path, sha256, size = svc.spool(file.file, settings)
    accepted = svc.accept_file(
        db,
        settings,
        get_scanner(settings),
        matter_id=matter.id,
        user_id=me.user.id,
        temp_path=temp_path,
        sha256=sha256,
        size=size,
        filename=svc.clean_filename(file.filename),
        origin=origin,
    )
    db.commit()
    if accepted.quarantined:
        raise ApiError(
            422,
            "malware_detected",
            "The malware scan flagged this file. It was quarantined and will not be read.",
            document_id=accepted.document.id,
        )
    assert accepted.job is not None
    return UploadAccepted(document_id=accepted.document.id, job_id=accepted.job.id)


@router.get("/matters/{matter_id}/documents", operation_id="listDocuments", responses=problem_responses(401, 403, 404))
def list_documents(
    matter_id: str,
    me: CurrentUser,
    db: ReadDB,
    status: Literal["queued", "processing", "ready", "failed", "quarantined"] | None = None,
    cursor: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> Page[DocumentOut]:
    matter = load_matter(db, me, matter_id)
    stmt = select(Document).where(Document.matter_id == matter.id)
    if status:
        stmt = stmt.where(Document.status == status)
    if cursor:
        stmt = stmt.where(Document.id > cursor)
    rows = list(db.execute(stmt.order_by(Document.id).limit(limit + 1)).scalars())
    page = rows[:limit]
    return Page[DocumentOut](
        items=[svc.to_out(d) for d in page], next_cursor=page[-1].id if len(rows) > limit and page else None
    )


@router.get("/documents/{document_id}", operation_id="getDocument", responses=problem_responses(401, 403, 404))
def get_document(document_id: str, me: CurrentUser, db: ReadDB) -> DocumentDetailOut:
    document, _ = load_in_matter(db, me, Document, document_id, label="Document")
    return svc.to_detail(db, document)


@router.get(
    "/documents/{document_id}/file",
    operation_id="getDocumentFile",
    response_class=FileResponse,
    responses={200: {"content": {"application/pdf": {}}}, **problem_responses(401, 403, 404, 409)},
)
def get_document_file(document_id: str, me: CurrentUser, db: ReadDB, settings: AppSettings) -> FileResponse:
    """The original bytes, with Range support for PDF.js. Quarantined files are never served."""
    document, _ = load_in_matter(db, me, Document, document_id, label="Document")
    if document.status == "quarantined":
        raise ApiError(409, "document_quarantined", "This file was quarantined by the malware scan.")
    store = open_store(settings)
    path = store.path(document.storage_path)
    if not path.exists():
        raise ApiError(404, "not_found", "The file is missing from storage.")
    headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}
    if store.key is not None:  # sealed on disk: decrypted in memory, no Range support
        return Response(  # type: ignore[return-value]
            store.read(document.storage_path),
            media_type=document.mime,
            headers={**headers, "Content-Disposition": f'inline; filename="{document.filename}"'},
        )
    return FileResponse(
        path,
        media_type=document.mime,
        filename=document.filename,
        content_disposition_type="inline",
        headers=headers,
    )


@router.get(
    "/documents/{document_id}/pages", operation_id="getDocumentPages", responses=problem_responses(401, 403, 404)
)
def get_document_pages(
    document_id: str,
    me: CurrentUser,
    db: ReadDB,
    from_page: int = Query(1, alias="from", ge=1),
    limit: int = Query(10, ge=1, le=50),
) -> PagesOut:
    """Text blocks with their boxes, page by page: the viewer for DOCX, email and text files, and in-document search."""
    document, _ = load_in_matter(db, me, Document, document_id, label="Document")
    pages = db.execute(
        select(DocPage)
        .where(DocPage.document_id == document.id, DocPage.page_no >= from_page)
        .order_by(DocPage.page_no)
        .limit(limit)
    ).scalars()
    out = [
        PageBlocks(
            page_no=p.page_no,
            width=p.width,
            height=p.height,
            has_text_layer=p.has_text_layer,
            ocr_conf=p.ocr_conf,
            blocks=[
                Block(
                    id=b["id"],
                    kind=b["kind"],
                    text=b["text"],
                    bbox=b["bbox"],
                    section_path=b.get("section_path"),
                    ref=b.get("ref"),
                )
                for b in (p.layout_json or {}).get("blocks", [])
            ],
        )
        for p in pages
    ]
    return PagesOut(document_id=document.id, pages_total=document.pages_total or 0, pages=out)


@router.get(
    "/documents/{document_id}/hidden-content",
    operation_id="getHiddenContent",
    responses=problem_responses(401, 403, 404),
)
def get_hidden_content(document_id: str, me: CurrentUser, db: WriteDB) -> HiddenContentOut:
    """A deliberate step (DEC-59): shows what was hidden in the file, and records that it was viewed."""
    document, _ = load_in_matter(db, me, Document, document_id, label="Document")
    hidden = document.hidden_content_json or {}
    items = [HiddenItem.model_validate(i) for i in hidden.get("items", [])]
    audit.append(
        db,
        action="view_hidden_content",
        entity_type="document",
        entity_id=document.id,
        user_id=me.user.id,
        matter_id=document.matter_id,
        details={"items": len(items), "origin": document.origin},
    )
    db.commit()
    notice = HIDDEN_NOTICE_OTHER_PARTY if document.origin == "other_party" else HIDDEN_NOTICE_CLIENT
    return HiddenContentOut(document_id=document.id, origin=document.origin, notice=notice, items=items)  # type: ignore[arg-type]


@router.get("/citations/{citation_id}", operation_id="getCitation", responses=problem_responses(401, 403, 404))
def get_citation(citation_id: int, me: CurrentUser, db: ReadDB) -> CitationLocationOut:
    """Where to open the viewer and what to highlight for one citation chip."""
    citation, _ = load_in_matter(db, me, MessageCitation, citation_id, label="Citation")
    document = db.get(Document, citation.document_id)
    page = db.execute(
        select(DocPage).where(DocPage.document_id == citation.document_id, DocPage.page_no == citation.page)
    ).scalar_one_or_none()
    boxes = citation.bbox_json or []
    first = next((b for b in boxes if b.get("page") == citation.page), None)
    return CitationLocationOut(
        id=citation.id,
        document_id=citation.document_id,
        document_name=document.filename if document else "",
        page=citation.page,
        para_ref=citation.para_ref,
        quote=citation.quote,
        bbox=first["bbox"] if first else None,
        boxes=boxes,
        page_width=page.width if page else None,
        page_height=page.height if page else None,
        verified=citation.verified,
    )


@router.delete(
    "/documents/{document_id}", operation_id="deleteDocument", responses=problem_responses(401, 403, 404, 409)
)
def delete_document(
    document_id: str,
    me: CurrentUser,
    db: WriteDB,
    settings: AppSettings,
    dry_run: bool = Query(False, description="List what would be removed, without removing it."),
) -> DeletionReport:
    """Deletes the file and everything made from it, in one transaction (DEC-58)."""
    document, _ = load_in_matter(db, me, Document, document_id, writable=not dry_run, label="Document")
    return deletion.delete_document(db, settings, me, document, dry_run=dry_run)


__all__ = ["Matter", "router"]
