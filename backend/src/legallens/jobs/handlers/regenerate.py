"""Job handler: regenerate one draft section as a new version with a diff (DEC-44)."""

from typing import Any

from legallens.db.models import Draft
from legallens.jobs.handlers import Handler
from legallens.jobs.queue import JobContext, JobError, result_url
from legallens.services import drafts


def run(ctx: JobContext) -> dict[str, Any]:
    payload = ctx.job.payload
    ctx.progress(20, "Rewriting the section", code="drafting")
    with ctx.session() as db:
        draft = db.get(Draft, payload["draft_id"])
        if draft is None:
            raise JobError("draft_missing", "The draft was deleted.")
        version = drafts.rewrite_section(db, draft, payload["section_id"], payload["instruction"], source="regenerate")
        version_no = version.version
    ctx.progress(90, "Checking the section", code="verifying")
    return {
        "kind": "draft",
        "id": payload["draft_id"],
        "url": result_url("draft", payload["draft_id"], ctx.job.id),
        "version": version_no,
        "section_id": payload["section_id"],
    }


HANDLER = Handler(run=run)
