"""Uploads (TA frame 6, steps 1–3): validate by bytes, check limits and duplicates, scan, store, queue.

The same `accept_file` path takes direct uploads and attachments split out of emails by the worker, so an
attachment is checked and scanned exactly like an upload (DEC-59).
"""

import hashlib
import re
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePath
from typing import BinaryIO

import pymupdf
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from legallens.config import Settings
from legallens.db.models import Chunk, DefinedTerm, Document, Job, Matter
from legallens.errors import ApiError
from legallens.ids import new_id
from legallens.ingestion.scanner import Scanner, ScannerUnavailable
from legallens.ingestion.sniff import sniff
from legallens.jobs.queue import enqueue
from legallens.schemas.common import ErrorInfo
from legallens.schemas.documents import Coverage, DocumentDetailOut, DocumentOut, HiddenContentNotice
from legallens.services import audit, events, matters
from legallens.storage.files import open_store

COPY_CHUNK = 1024 * 1024
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def clean_filename(name: str | None) -> str:
    base = PurePath((name or "").replace("\\", "/")).name
    base = _CONTROL.sub("", base).strip() or "document"
    return base[:255]


@dataclass
class Accepted:
    document: Document
    job: Job | None
    quarantined: bool = False
    duplicate_of: str | None = None


def spool(stream: BinaryIO, settings: Settings) -> tuple[Path, str, int]:
    """Copies an upload to a private temp file, hashing as it goes, and enforces the size cap."""
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    target = settings.tmp_dir / f"upload-{uuid.uuid4().hex}"
    digest = hashlib.sha256()
    size = 0
    with target.open("wb") as out:
        target.chmod(0o600)
        while chunk := stream.read(COPY_CHUNK):
            size += len(chunk)
            if size > settings.max_upload_bytes:
                out.close()
                target.unlink(missing_ok=True)
                raise ApiError(413, "file_too_large", f"Files can be up to {settings.max_upload_mb} MB.")
            digest.update(chunk)
            out.write(chunk)
    return target, digest.hexdigest(), size


def _pdf_pages(path: Path, settings: Settings) -> int:
    try:
        with pymupdf.open(path) as pdf:
            if pdf.needs_pass:
                raise ApiError(
                    422, "unreadable_file", "This PDF is password-protected. Remove the password and upload it again."
                )
            pages = pdf.page_count
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(422, "unreadable_file", "This PDF can't be opened. It may be damaged.") from exc
    if pages > settings.max_pages:
        raise ApiError(413, "too_many_pages", f"PDFs can have up to {settings.max_pages} pages; this one has {pages}.")
    return pages


def accept_file(
    db: Session,
    settings: Settings,
    scanner: Scanner,
    *,
    matter_id: str,
    user_id: str | None,
    temp_path: Path,
    sha256: str,
    size: int,
    filename: str,
    origin: str,
    parent_document_id: str | None = None,
) -> Accepted:
    """Takes ownership of temp_path: it ends up stored, quarantined or deleted."""
    try:
        file_type = sniff(temp_path)
        if file_type is None:
            raise ApiError(
                415, "unsupported_type", "LegalLens accepts PDF, Word (.docx), email (.eml, .msg) and text files."
            )
        if size == 0:
            raise ApiError(422, "unreadable_file", "This file is empty.")
        pages = _pdf_pages(temp_path, settings) if file_type.kind == "pdf" else None
        existing = db.execute(
            select(Document).where(Document.matter_id == matter_id, Document.sha256 == sha256)
        ).scalar_one_or_none()
        if existing is not None:
            if parent_document_id is not None:
                temp_path.unlink(missing_ok=True)
                return Accepted(existing, None, duplicate_of=existing.id)
            raise ApiError(
                409,
                "duplicate_document",
                f"This file is already in the matter as {existing.filename}.",
                existing_document_id=existing.id,
            )
        try:
            scan = scanner.scan(temp_path)
        except ScannerUnavailable as exc:
            raise ApiError(
                503, "scanner_unavailable", "The malware scanner isn't running, so the file wasn't accepted."
            ) from exc
    except BaseException:
        temp_path.unlink(missing_ok=True)
        raise

    document_id = new_id("document")
    document = Document(
        id=document_id,
        matter_id=matter_id,
        filename=filename,
        mime=file_type.mime,
        ext=file_type.ext,
        size_bytes=size,
        sha256=sha256,
        origin=origin,
        storage_path="",
        pages_total=pages,
        scan_status=scan.status,
        parent_document_id=parent_document_id,
    )
    if scan.status == "infected":
        folder = settings.quarantine_dir / matter_id
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / f"{document_id}.{file_type.ext}"
        shutil.move(str(temp_path), target)
        target.chmod(0o600)
        document.storage_path = str(target)
        document.status = "quarantined"
        document.error_json = {
            "code": "malware_detected",
            "message": "The malware scan flagged this file. It was quarantined and will not be read.",
        }
        db.add(document)
        db.flush()
        audit.append(
            db,
            action="upload",
            entity_type="document",
            entity_id=document_id,
            user_id=user_id,
            matter_id=matter_id,
            details={"result": "quarantined", "kind": file_type.kind, "size": size},
        )
        events.emit(
            db,
            matter_id,
            "document.failed",
            {
                "document_id": document_id,
                "name": document.filename,
                "reason": document.error_json["message"],
                "quarantined": True,
            },
        )
        return Accepted(document, None, quarantined=True)

    document.storage_path = open_store(settings).put(matter_id, document_id, file_type.ext, temp_path)
    document.status = "queued"
    db.add(document)
    db.flush()
    job = enqueue(
        db, matter_id=matter_id, kind="ingest", document_id=document_id, max_attempts=settings.job_max_attempts
    )
    audit.append(
        db,
        action="upload",
        entity_type="document",
        entity_id=document_id,
        user_id=user_id,
        matter_id=matter_id,
        details={
            "result": "queued",
            "kind": file_type.kind,
            "size": size,
            "origin": origin,
            "job_id": job.id,
            "parent_document_id": parent_document_id,
        },
    )
    matter = db.get(Matter, matter_id)
    if matter is not None:
        matters.touch(matter)
    return Accepted(document, job)


# ---------------------------------------------------------------- read models


def to_out(d: Document) -> DocumentOut:
    hidden = d.hidden_content_json or {}
    kinds = sorted((hidden.get("counts") or {}).keys())
    return DocumentOut(
        id=d.id,
        matter_id=d.matter_id,
        filename=d.filename,
        mime=d.mime,
        size_bytes=d.size_bytes,
        sha256=d.sha256,
        origin=d.origin,  # type: ignore[arg-type]
        status=d.status,  # type: ignore[arg-type]
        scan_status=d.scan_status,  # type: ignore[arg-type]
        pages_total=d.pages_total,
        pages_processed=d.pages_processed,
        ocr_conf_avg=d.ocr_conf_avg,
        hidden_content=HiddenContentNotice(kinds=kinds, count=sum(hidden["counts"].values())) if kinds else None,  # type: ignore[arg-type]
        parent_document_id=d.parent_document_id,
        error=ErrorInfo.model_validate(d.error_json) if d.error_json else None,
        uploaded_at=d.uploaded_at,
        ready_at=d.ready_at,
        coverage=Coverage.model_validate(d.coverage_json) if d.coverage_json else None,
    )


def to_detail(db: Session, d: Document) -> DocumentDetailOut:
    chunk_count = db.execute(
        select(func.count(Chunk.id)).where(Chunk.document_id == d.id, Chunk.kind != "section")
    ).scalar_one()
    term_count = db.execute(select(func.count(DefinedTerm.id)).where(DefinedTerm.document_id == d.id)).scalar_one()
    job_id = db.execute(
        select(Job.id).where(Job.document_id == d.id, Job.kind == "ingest").order_by(Job.created_at.desc()).limit(1)
    ).scalar()
    return DocumentDetailOut(
        **to_out(d).model_dump(),
        chunk_count=chunk_count,
        defined_term_count=term_count,
        job_id=job_id,
    )
