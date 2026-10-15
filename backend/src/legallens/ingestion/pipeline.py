"""Ingestion in the worker (TA frame 6, steps 4–11): hidden content → format → triage/OCR → layout →
legal structure → chunks → embeddings → one transaction → coverage report → document.ready.

Slow work (conversion, OCR, embedding) happens outside any transaction. The final write is one short
BEGIN IMMEDIATE transaction, so a crash leaves either the old state or the complete new one.
"""

import hashlib
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import delete, text

from legallens.db.models import Chunk, DefinedTerm, DocPage, Document
from legallens.ingestion import chunker, coverage, email, hidden, legal
from legallens.ingestion.convert import Converted, get_converter
from legallens.ingestion.convert.text import convert_text, decode
from legallens.ingestion.scanner import get_scanner
from legallens.jobs.queue import JobContext, JobError, result_url
from legallens.models.embedder import get_embedder, to_blob
from legallens.search import index_guard
from legallens.search.scope import display_name
from legallens.services import events
from legallens.services.documents import accept_file, clean_filename
from legallens.storage.files import open_store
from legallens.timeutil import utcnow

log = logging.getLogger("legallens.ingest")
EMBED_BATCH = 32


def _set_status(ctx: JobContext, document_id: str, status: str) -> None:
    with ctx.session() as db:
        document = db.get(Document, document_id)
        if document is None:
            raise JobError("document_missing", "The document was deleted.")
        document.status = status
        document.error_json = None


def _split_email(ctx: JobContext, document: dict[str, Any], path: Path, workdir: Path) -> Converted:
    parts = email.parse(path, document["ext"])
    attachments: list[dict[str, Any]] = []
    scanner = get_scanner(ctx.settings)
    for name, data in parts.attachments:
        filename = clean_filename(name)
        temp = workdir / f"attachment-{uuid.uuid4().hex}"
        temp.write_bytes(data)
        temp.chmod(0o600)
        if len(data) > ctx.settings.max_upload_bytes:
            temp.unlink(missing_ok=True)
            attachments.append({"filename": filename, "status": "rejected", "reason": "file_too_large"})
            continue
        try:
            with ctx.session() as db:
                accepted = accept_file(
                    db,
                    ctx.settings,
                    scanner,
                    matter_id=ctx.matter_id,
                    user_id=None,
                    temp_path=temp,
                    sha256=hashlib.sha256(data).hexdigest(),
                    size=len(data),
                    filename=filename,
                    origin=document["origin"],
                    parent_document_id=document["id"],
                )
            status = "quarantined" if accepted.quarantined else ("duplicate" if accepted.duplicate_of else "queued")
            attachments.append({"filename": filename, "status": status, "document_id": accepted.document.id})
        except Exception as exc:  # an unsupported or unreadable attachment doesn't fail the email
            code = getattr(exc, "code", "rejected")
            attachments.append({"filename": filename, "status": "rejected", "reason": code})
    for name in parts.skipped:
        attachments.append({"filename": clean_filename(name), "status": "skipped", "reason": "not_unpacked"})
    converted = convert_text(parts.as_text())
    converted.metadata = {**parts.metadata(), "attachments": attachments}
    return converted


def ingest(ctx: JobContext) -> dict[str, Any]:
    document_id = ctx.job.document_id
    if document_id is None:
        raise JobError("bad_job", "This ingest job has no document.")
    settings = ctx.settings
    with ctx.read_session() as db:
        doc = db.get(Document, document_id)
        if doc is None:
            raise JobError("document_missing", "The document was deleted.")
        document = {
            "id": doc.id,
            "ext": doc.ext,
            "origin": doc.origin,
            "filename": doc.filename,
            "storage_path": doc.storage_path,
        }
    _set_status(ctx, document_id, "processing")
    ctx.progress(5, "Checking file", code="checking")

    workdir = settings.tmp_dir / f"ingest-{ctx.job.id}"
    workdir.mkdir(parents=True, exist_ok=True)
    try:
        # A plaintext copy inside the job's own work folder, removed with it; the stored file may be sealed.
        source = open_store(settings).materialize(document["storage_path"], workdir)
        kind = document["ext"]
        report = hidden.HiddenReport()
        if kind in ("eml", "msg"):
            ctx.progress(10, "Reading the email", code="reading")
            converted = _split_email(ctx, document, source, workdir)
        elif kind == "txt":
            converted = convert_text(decode(source.read_bytes()))
        else:
            ctx.progress(10, "Checking for hidden content", code="checking")
            sanitized, report = hidden.sanitize(source, kind, workdir)
            ctx.progress(20, "Reading pages", code="reading")
            converted = get_converter(settings).convert(
                sanitized,
                kind,
                lambda pct, step: ctx.progress(pct, step, code="ocr" if step.startswith("OCR") else "reading"),
            )
        ctx.check_cancelled()

        ctx.progress(60, "Finding structure", code="indexing")
        structure = legal.analyse(converted.blocks, converted.pages)
        body_units = [u for u in structure.units if u.kind != "heading"]
        if not body_units:
            raise JobError(
                "no_text",
                "No readable text was found. If this is a scan, try a clearer copy (pages may be image-only).",
            )
        name = display_name(document["filename"])
        specs = chunker.build(structure.units, name)
        report_coverage = coverage.build(converted.pages, structure.units, settings.ocr_low_confidence)

        ctx.progress(70, "Indexing", code="indexing")
        embedder = get_embedder(settings)
        children = [s for s in specs if s.kind != "section"]
        vectors: list[list[float]] = []
        for start in range(0, len(children), EMBED_BATCH):
            batch = children[start : start + EMBED_BATCH]
            vectors.extend(embedder.embed([f"{s.header}\n{s.text}" for s in batch]))
            ctx.progress(70 + int(20 * (start + len(batch)) / max(len(children), 1)), "Indexing", code="indexing")
        ctx.check_cancelled()

        _write(
            ctx,
            document_id,
            converted,
            structure,
            specs,
            vectors,
            report,
            report_coverage,
            index_guard.signature(embedder),
        )
        log.info(
            "document_ingested",
            extra={
                "document_id": document_id,
                "pages": len(converted.pages),
                "chunks": len(children),
                "converter": converted.converter,
                "hidden_items": sum(report.counts.values()),
            },
        )
        return {"kind": "document", "id": document_id, "url": result_url("document", document_id, ctx.job.id)}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _write(
    ctx: JobContext,
    document_id: str,
    converted: Converted,
    structure: legal.Structure,
    specs: list[chunker.ChunkSpec],
    vectors: list[list[float]],
    report: hidden.HiddenReport,
    report_coverage: dict[str, Any],
    embedder_signature: str,
) -> None:
    with ctx.session() as db:
        document = db.get(Document, document_id)
        if document is None:
            raise JobError("document_missing", "The document was deleted.")
        matter_id = document.matter_id
        # Never mix vectors from two models in one index (D7); `legallens reindex` rebuilds it.
        have = index_guard.stored(db, matter_id)
        if have is not None and have != embedder_signature:
            raise JobError(
                "index_stale",
                f"The search index was built with {have}, not {embedder_signature}. Run `legallens reindex` first.",
            )
        index_guard.record(db, matter_id, embedder_signature)
        # Re-ingesting replaces everything made from this document (the chunk triggers clear FTS5 and vectors).
        db.execute(delete(DefinedTerm).where(DefinedTerm.document_id == document_id))
        db.execute(delete(Chunk).where(Chunk.document_id == document_id, Chunk.parent_chunk_id.is_not(None)))
        db.execute(delete(Chunk).where(Chunk.document_id == document_id))
        db.execute(delete(DocPage).where(DocPage.document_id == document_id))

        unit_section = {id(u.block): " › ".join(u.section) for u in structure.units}
        # The block's pinpoint, the same reference its citations carry, so the viewer can highlight by it (INT-1.4)
        unit_ref = {id(u.block): u.para_ref for u in structure.units}
        page_blocks: dict[int, list[dict[str, Any]]] = {}
        for block_id, block in enumerate(converted.blocks):
            page_blocks.setdefault(block.page, []).append(
                {
                    "id": block_id,
                    "kind": block.kind,
                    "text": block.text,
                    "bbox": block.bbox,
                    "section_path": unit_section.get(id(block)),
                    "ref": unit_ref.get(id(block)),
                }
            )
        bates_by_page: dict[int, list[str]] = {}
        for b in structure.bates:
            bates_by_page.setdefault(int(b["page"]), []).append(str(b["value"]))  # type: ignore[call-overload]
        for page in converted.pages:
            db.add(
                DocPage(
                    matter_id=matter_id,
                    document_id=document_id,
                    page_no=page.page_no,
                    width=page.width,
                    height=page.height,
                    has_text_layer=page.has_text_layer,
                    ocr_conf=page.ocr_conf,
                    readable=page.page_no not in report_coverage["pages_unreadable"],
                    layout_json={
                        "blocks": page_blocks.get(page.page_no, []),
                        "bates": bates_by_page.get(page.page_no, []),
                    },
                )
            )

        rows: list[Chunk] = []
        for seq, spec in enumerate(specs):
            row = Chunk(
                matter_id=matter_id,
                document_id=document_id,
                parent_chunk_id=rows[spec.parent].id if spec.parent is not None else None,
                kind=spec.kind,
                seq=seq,
                section_path=spec.section_path,
                clause_ref=spec.clause_ref,
                para_ref=spec.para_ref,
                header=spec.header,
                page_start=spec.page_start,
                page_end=spec.page_end,
                text=spec.text,
                token_count=spec.token_count,
                bbox_json=spec.boxes,
            )
            db.add(row)
            db.flush()
            rows.append(row)

        children = [(spec, row) for spec, row in zip(specs, rows, strict=True) if spec.kind != "section"]
        for (_, row), vector in zip(children, vectors, strict=True):
            db.execute(
                text("INSERT INTO chunks_vec(rowid, matter_id, document_id, embedding) VALUES (:r, :m, :d, :e)"),
                {"r": row.id, "m": matter_id, "d": document_id, "e": to_blob(vector)},
            )

        chunk_for_unit: dict[int, int] = {}
        for spec, row in children:
            for unit_index in spec.unit_indexes:
                chunk_for_unit.setdefault(unit_index, row.id)
        seen_terms: set[str] = set()
        for term, unit_index in structure.defined_terms:
            if term.lower() in seen_terms:
                continue
            seen_terms.add(term.lower())
            db.add(
                DefinedTerm(
                    matter_id=matter_id,
                    document_id=document_id,
                    term=term,
                    definition_chunk_id=chunk_for_unit.get(unit_index),
                    definition_text=structure.units[unit_index].block.text.strip()[:2000],
                )
            )

        ocr_scores = [p.ocr_conf for p in converted.pages if p.ocr_used and p.ocr_conf is not None]
        document.status = "ready"
        document.pages_total = len(converted.pages)
        document.pages_processed = report_coverage["pages_read"]
        document.ocr_conf_avg = round(sum(ocr_scores) / len(ocr_scores), 3) if ocr_scores else None
        document.coverage_json = report_coverage
        document.hidden_content_json = report.as_json()
        document.metadata_json = {
            **(converted.metadata or {}),
            "converter": converted.converter,
            "bates": structure.bates[:200],
            "furniture_blocks_dropped": structure.furniture,
        }
        document.error_json = None
        document.ready_at = utcnow()
        events.emit(
            db,
            matter_id,
            "document.ready",
            {"document_id": document_id, "name": document.filename, "coverage": report_coverage},
        )


def on_failure(ctx: JobContext, code: str, message: str) -> None:
    document_id = ctx.job.document_id
    if not document_id:
        return
    with ctx.session() as db:
        document = db.get(Document, document_id)
        if document is None:
            return
        document.status = "failed"
        document.error_json = {"code": code, "message": message}
        events.emit(
            db,
            ctx.matter_id,
            "document.failed",
            {"document_id": document_id, "name": document.filename, "reason": message, "quarantined": False},
        )
