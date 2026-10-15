"""Summaries (DEC-40, DEC-41, DEC-42): templates, starting the job, and the response shape."""

import hashlib
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from legallens.db.models import Document, Export, Summary
from legallens.drafting.docx_export import build_summary
from legallens.errors import ApiError
from legallens.ids import new_id
from legallens.jobs.queue import enqueue
from legallens.schemas.common import ErrorInfo, InlineCitation
from legallens.schemas.documents import Coverage
from legallens.schemas.jobs import SummaryListItem, SummaryOut, SummarySection
from legallens.search.scope import display_name
from legallens.services import audit


@dataclass(frozen=True)
class Field:
    key: str
    title: str
    keywords: tuple[str, ...]


TEMPLATES: dict[str, tuple[Field, ...]] = {
    # Letter or demand received: always included, because it feeds Draft (DEC-40).
    "letter_demand": (
        Field("sender", "Who sent it", ("sincerely", "regards", "counsel", "attorney", "behalf", "represent", "firm")),
        Field("recipient", "Who it is addressed to", ("dear", "attention", "addressed", "re")),
        Field("demands", "What they demand", ("demand", "request", "require", "pay", "payment", "cease", "remit")),
        Field("deadlines", "Deadlines", ("within", "days", "deadline", "later", "date", "before")),
        Field("claims", "Each claim made", ("claim", "breach", "failed", "failure", "violation", "owe", "allege")),
        Field("threats", "Threats and consequences", ("litigation", "lawsuit", "legal", "court", "remedies", "suit")),
        Field("amounts", "Amounts", ("amount", "sum", "damages", "fees", "total", "dollars", "usd")),
    ),
    "pleading": (
        Field("parties", "Parties", ("plaintiff", "defendant", "parties", "party", "petitioner", "respondent")),
        Field("court", "Court and case", ("court", "district", "county", "case", "civil", "action", "venue")),
        Field("causes_of_action", "Causes of action", ("count", "cause", "action", "breach", "negligence", "fraud")),
        Field("allegations", "Key allegations", ("alleges", "allegation", "information", "belief", "facts")),
        Field("relief", "Relief sought", ("relief", "prayer", "wherefore", "damages", "injunction", "judgment")),
    ),
    "opinion": (
        Field("facts", "Facts", ("facts", "background", "plaintiff", "defendant", "contract", "agreement")),
        Field("posture", "Procedural posture", ("appeal", "motion", "granted", "denied", "procedural", "trial")),
        Field("issue", "Issue", ("issue", "question", "whether", "presented")),
        Field("holding", "Holding", ("hold", "held", "conclude", "holding")),
        Field("reasoning", "Reasoning", ("because", "reason", "analysis", "therefore", "accordingly", "standard")),
        Field(
            "disposition", "Disposition", ("affirm", "affirmed", "reverse", "remand", "vacate", "dismiss", "ordered")
        ),
    ),
}

AUDIENCE_PASSAGES = {"one_paragraph": 1, "plain_english": 2, "detailed": 3}
NOT_FOUND = "Not found in this document."


def start(
    db: Session,
    *,
    user_id: str,
    document: Document,
    template: str,
    audience: str,
    conversation_id: str | None = None,
) -> tuple[Summary, str]:
    if document.status != "ready":
        raise ApiError(409, "document_not_ready", "This document is still being processed. Try again when it's ready.")
    summary = Summary(
        id=new_id("summary"),
        matter_id=document.matter_id,
        document_id=document.id,
        template=template,
        audience=audience,
        status="pending",
        conversation_id=conversation_id,
    )
    db.add(summary)
    db.flush()
    job = enqueue(
        db,
        matter_id=document.matter_id,
        kind="summarize",
        payload={"summary_id": summary.id, "conversation_id": conversation_id},
        max_attempts=2,
    )
    summary.job_id = job.id
    audit.append(
        db,
        action="generate",
        entity_type="summary",
        entity_id=summary.id,
        user_id=user_id,
        matter_id=document.matter_id,
        details={"document_id": document.id, "template": template, "audience": audience, "job_id": job.id},
    )
    return summary, job.id


def list_item(summary: Summary, document_name: str) -> SummaryListItem:
    return SummaryListItem(
        id=summary.id,
        document_id=summary.document_id,
        document_name=document_name,
        template=summary.template,  # type: ignore[arg-type]
        audience=summary.audience,  # type: ignore[arg-type]
        status=summary.status,  # type: ignore[arg-type]
        conversation_id=summary.conversation_id,
        created_at=summary.created_at,
    )


TEMPLATE_TITLES = {
    "letter_demand": "Letter or demand received",
    "pleading": "Complaint or pleading",
    "opinion": "Court opinion (case brief)",
}
AUDIENCE_TITLES = {
    "one_paragraph": "One paragraph",
    "detailed": "Detailed digest",
    "plain_english": "Plain English for the client",
}


def export(db: Session, user_id: str, summary: Summary, document_name: str) -> tuple[bytes, str]:
    """The summary as a .docx working copy (decision 5), recorded and audited like draft exports."""
    if summary.status != "ready":
        raise ApiError(409, "summary_not_ready", "The summary is not ready yet.")
    out = to_out(summary, document_name)
    data = build_summary(
        {
            "document_name": document_name,
            "template_title": TEMPLATE_TITLES[summary.template],
            "audience_title": AUDIENCE_TITLES[summary.audience],
            "coverage_text": (summary.coverage_json or {}).get("text"),
            "sections": [s.model_dump() for s in out.sections],
            "model_id": summary.model_id,
        }
    )
    digest = hashlib.sha256(data).hexdigest()
    db.add(
        Export(id=new_id("export"), matter_id=summary.matter_id, summary_id=summary.id, kind="summary", sha256=digest)
    )
    audit.append(
        db,
        action="export",
        entity_type="summary",
        entity_id=summary.id,
        user_id=user_id,
        matter_id=summary.matter_id,
        details={"kind": "summary", "sha256": digest},
    )
    stem = re.sub(r"[^a-z0-9]+", "-", display_name(document_name).lower()).strip("-") or "document"
    return data, f"summary-{stem}.docx"


def to_out(summary: Summary, document_name: str | None = None) -> SummaryOut:
    content = summary.content_json or {}
    sections = [
        SummarySection(
            field=s["field"],
            title=s["title"],
            found=s["found"],
            content=s["content"],
            citations=[InlineCitation.model_validate(c) for c in s.get("citations", [])],
        )
        for s in content.get("sections", [])
    ]
    return SummaryOut(
        id=summary.id,
        matter_id=summary.matter_id,
        document_id=summary.document_id,
        document_name=document_name,
        conversation_id=summary.conversation_id,
        template=summary.template,  # type: ignore[arg-type]
        audience=summary.audience,  # type: ignore[arg-type]
        status=summary.status,  # type: ignore[arg-type]
        job_id=summary.job_id,
        sections=sections,
        coverage=Coverage.model_validate(summary.coverage_json) if summary.coverage_json else None,
        model_id=summary.model_id,
        prompt_version=summary.prompt_version,
        error=ErrorInfo.model_validate(summary.error_json) if summary.error_json else None,
        created_at=summary.created_at,
    )
