"""Job handler: summarize one document with a template (DEC-40 to DEC-42).

The stub reads the whole document in reading order (no retrieval decides what is skipped), then fills each
template field with the best matching passages from that document, quoted with citations, or marks the field
"Not found in this document". The LangChain map-reduce replaces the per-field wording later.
"""

from typing import Any

from sqlalchemy import func, select

from legallens.db.models import Chunk, Document, Summary
from legallens.jobs.handlers import Handler
from legallens.jobs.queue import JobContext, JobError, result_url
from legallens.models.embedder import get_embedder
from legallens.models.llm import LLMError, get_llm, run_sync
from legallens.orchestrator.errors import log_failure
from legallens.orchestrator.local import prompts, text
from legallens.orchestrator.stub.orchestrator import MODEL_ID, PROMPT_VERSION
from legallens.search.hybrid import Hit, _load_hits, hybrid_search
from legallens.search.pinpoint import pinpoint
from legallens.search.sentences import best_sentence
from legallens.services.summaries import AUDIENCE_PASSAGES, NOT_FOUND, TEMPLATES

SUMMARY_DOC_CHARS = 16000  # a document up to this size goes to the model whole; longer ones by relevance
SUMMARY_FIELD_PASSAGES = 10
SUMMARY_TOKENS = 500


def _extractive_section(
    ctx: JobContext,
    field: Any,
    document_id: str,
    filename: str,
    audience: str,
    per_field: int,
    embedder: Any,
    n: int,
) -> tuple[dict[str, Any], int]:
    """The no-model field: the best matching passages, quoted verbatim with citations."""
    with ctx.read_session() as db:
        result = hybrid_search(
            db,
            embedder,
            matter_id=ctx.matter_id,
            query=" ".join(field.keywords),
            document_ids=[document_id],
            k_fused=10,
        )
    hits = [h for h in result.hits if h.bm25_rank is not None][:per_field]
    citations, quotes = [], []
    for hit in hits:
        n += 1
        quote = best_sentence(hit.text, list(field.keywords))
        page, para_ref, boxes = pinpoint(hit.text, hit.bbox, quote, hit.page_start, hit.para_ref)
        quotes.append(f"“{quote}” [{n}]")
        citations.append(
            {
                "n": n,
                "chunk_id": hit.chunk_id,
                "document_id": hit.document_id,
                "document_name": filename,
                "page": page,
                "para_ref": para_ref,
                "quote": quote,
                "bbox": boxes,
            }
        )
    if not quotes:
        content = NOT_FOUND
    elif audience == "plain_english":
        content = "In plain terms, the document says: " + " ".join(quotes)
    elif audience == "one_paragraph":
        content = quotes[0]
    else:
        content = "\n".join(f"- {q}" for q in quotes)
    section = {
        "field": field.key,
        "title": field.title,
        "found": bool(quotes),
        "content": content,
        "citations": citations,
    }
    return section, n


def _passages_for(ctx: JobContext, field: Any, document_id: str, embedder: Any) -> list[Hit]:
    """The whole document in reading order when it fits the model's window, else the passages that match."""
    with ctx.read_session() as db:
        rows = db.execute(
            select(Chunk.id, func.length(Chunk.text))
            .where(Chunk.document_id == document_id, Chunk.kind != "section")
            .order_by(Chunk.seq)
        ).all()
        if sum(length for _, length in rows) <= SUMMARY_DOC_CHARS:
            loaded = _load_hits(db, ctx.matter_id, [cid for cid, _ in rows])
            return [loaded[cid] for cid, _ in rows if cid in loaded]
        result = hybrid_search(
            db,
            embedder,
            matter_id=ctx.matter_id,
            query=f"{field.title}. {' '.join(field.keywords)}",
            document_ids=[document_id],
            k_fused=SUMMARY_FIELD_PASSAGES,
        )
        return result.hits


def _model_section(
    ctx: JobContext,
    llm: Any,
    field: Any,
    document_id: str,
    filename: str,
    audience: str,
    embedder: Any,
    n: int,
    model: str,
) -> tuple[dict[str, Any] | None, int]:
    """One field written by the local model and checked against the passages. None means "use the quotes
    instead": the model failed, gave no usable citation, said "not found", or a claim did not check out."""
    hits = _passages_for(ctx, field, document_id, embedder)
    if not hits:
        return None, n
    system = prompts.SUMMARY_SYSTEM.format(
        style=prompts.AUDIENCE_STYLE.get(audience, prompts.AUDIENCE_STYLE["detailed"])
    )
    try:
        result = run_sync(
            llm.complete(model, system, text.build_prompt(f"Summarize: {field.title}", hits), max_tokens=SUMMARY_TOKENS)
        )
    except LLMError as exc:
        log_failure(ctx.settings, exc, stage="summarize", run_id=ctx.job.id, matter_id=ctx.matter_id, model=model)
        return None, n
    checked = text.check_answer(result.text, hits, field.title)
    # A model "not found" goes to the quotes too: they say "Not found in this document" themselves when no
    # passage matches, and a small model missing a deadline that is there would be the worse error.
    if checked is None or checked.not_found or checked.unsupported_numbers:
        return None, n
    if any(not c.verified for c in checked.citations):
        return None, n

    offset = n
    content = text.MARKER.sub(lambda m: f"[{int(m.group(1)) + offset}]", checked.text)
    citations = [
        {
            "n": c.n + offset,
            "chunk_id": c.hit.chunk_id,
            "document_id": c.hit.document_id,
            "document_name": filename,
            "page": c.page,
            "para_ref": c.para_ref,
            "quote": c.quote,
            "bbox": c.bbox,
        }
        for c in checked.citations
    ]
    section = {"field": field.key, "title": field.title, "found": True, "content": content, "citations": citations}
    return section, n + len(citations)


def run(ctx: JobContext) -> dict[str, Any]:
    summary_id = ctx.job.payload["summary_id"]
    with ctx.read_session() as db:
        summary = db.get(Summary, summary_id)
        if summary is None:
            raise JobError("summary_missing", "The summary was deleted.")
        document = db.get(Document, summary.document_id)
        if document is None or document.status != "ready":
            raise JobError("document_not_ready", "The document is not ready.")
        template, audience, document_id = summary.template, summary.audience, document.id
        filename, doc_coverage = document.filename, dict(document.coverage_json or {})
        pages = document.pages_total or 0
        chunks_read = db.execute(
            select(func.count(Chunk.id)).where(Chunk.document_id == document_id, Chunk.kind != "section")
        ).scalar_one()

    ctx.progress(3, f"Reading {filename}", code="reading")
    fields = TEMPLATES[template]
    per_field = AUDIENCE_PASSAGES[audience]
    embedder = get_embedder(ctx.settings)
    sections: list[dict[str, Any]] = []
    n = 0
    use_model = ctx.settings.orchestrator == "local"
    model = (
        ctx.settings.llm_summary_long_model
        if pages > ctx.settings.summary_long_pages
        else ctx.settings.llm_summary_model
    )
    llm = get_llm(ctx.settings) if use_model else None
    fallback: list[str] = []
    for index, field in enumerate(fields, start=1):
        ctx.progress(
            5 + int(80 * (index - 1) / len(fields)),
            f"Field {index} of {len(fields)}: {field.title}",
            code="extracting",
        )
        section = None
        if llm is not None:
            section, n = _model_section(ctx, llm, field, document_id, filename, audience, embedder, n, model)
            if section is None:
                fallback.append(field.key)
        if section is None:
            section, n = _extractive_section(ctx, field, document_id, filename, audience, per_field, embedder, n)
        sections.append(section)

    ctx.progress(88, "Writing the summary", code="writing")
    ctx.progress(95, "Adding the coverage report", code="verifying")
    with ctx.session() as db:
        summary = db.get(Summary, summary_id)
        if summary is None:
            raise JobError("summary_missing", "The summary was deleted.")
        summary.content_json = {"sections": sections, "chunks_read": chunks_read}
        if fallback:
            summary.content_json["fallback_fields"] = fallback
        summary.coverage_json = doc_coverage or None
        summary.status = "ready"
        # Provenance names the model only if it wrote at least one field.
        wrote = use_model and len(fallback) < len(fields)
        summary.model_id = model if wrote else MODEL_ID
        summary.prompt_version = prompts.SUMMARY_PROMPT_VERSION if wrote else PROMPT_VERSION
    return {
        "kind": "summary",
        "id": summary_id,
        "url": result_url("summary", summary_id, ctx.job.id),
        "document_id": document_id,
        "document_name": filename,
    }


def on_failure(ctx: JobContext, code: str, message: str) -> None:
    with ctx.session() as db:
        summary = db.get(Summary, ctx.job.payload.get("summary_id"))
        if summary is not None:
            summary.status = "failed"
            summary.error_json = {"code": code, "message": message}


HANDLER = Handler(run=run, on_failure=on_failure)
