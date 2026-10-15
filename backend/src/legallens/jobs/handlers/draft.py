"""Job handler: write the first version of a draft (DEC-43, DEC-47, DEC-48)."""

from typing import Any

from legallens.db.models import Draft
from legallens.drafting import authorities, templates
from legallens.jobs.handlers import Handler
from legallens.jobs.queue import JobContext, JobError, result_url
from legallens.models.embedder import get_embedder
from legallens.models.llm import LLMError, get_llm, run_sync
from legallens.orchestrator.errors import log_failure
from legallens.orchestrator.local import prompts, text
from legallens.search.hybrid import Hit
from legallens.services import drafts

RESPONSE_TOKENS = 400


def _hit(fact: dict[str, Any]) -> Hit:
    return Hit(
        chunk_id=fact["chunk_id"],
        document_id=fact["document_id"],
        document_name=fact["document_name"],
        kind="text",
        seq=fact.get("seq", 0),
        header="",
        section_path=None,
        clause_ref=None,
        para_ref=fact.get("para_ref"),
        page_start=fact["page"],
        page_end=fact["page"],
        text=fact["text"],
        bbox=fact.get("bbox") or [],
        parent_chunk_id=None,
    )


class Responder:
    """The model's paragraph for one point, or None to keep the template's placeholder.

    A paragraph is used only if every citation checks out, every figure is in a cited passage, and it names no
    authority: the model is never a source of law, so [CITE NEEDED] stays for the lawyer. The other side's point
    is untrusted text, so it goes in the prompt's <point> block, never in the instruction line. Each call reports
    progress, which keeps the job's heartbeat fresh and lets a cancel stop the draft between points.
    """

    system = prompts.DRAFT_SYSTEM

    def __init__(self, ctx: JobContext) -> None:
        self.ctx = ctx
        self.llm = get_llm(ctx.settings)
        self.model = ctx.settings.llm_draft_model
        self.asked = 0
        self.written = 0

    def prompt(self, claim: str, hits: list[Any]) -> str:
        return text.build_prompt("Respond to the other side's point quoted in the <point> block.", hits, point=claim)

    def __call__(self, claim: str, facts: list[dict[str, Any]]) -> templates.Response | None:
        self.asked += 1
        self.ctx.progress(min(78, 50 + 4 * self.asked), f"Drafting the response to point {self.asked}", code="drafting")
        hits = [_hit(f) for f in facts]
        prompt = self.prompt(claim, hits)
        try:
            result = run_sync(self.llm.complete(self.model, self.system, prompt, max_tokens=RESPONSE_TOKENS))
        except LLMError as exc:
            log_failure(
                self.ctx.settings,
                exc,
                stage="draft",
                run_id=self.ctx.job.id,
                matter_id=self.ctx.matter_id,
                model=self.model,
            )
            return None
        checked = text.check_answer(result.text, hits, claim, also=claim)
        if checked is None or checked.not_found or checked.unsupported_numbers:
            return None
        if any(not c.verified for c in checked.citations) or authorities.find(checked.text):
            return None
        self.written += 1
        return templates.Response(text=checked.text, uses=[(hits.index(c.hit), c.quote) for c in checked.citations])


class FactsWriter(Responder):
    """The memo's Statement of Facts: the same checks as a letter paragraph, a different instruction."""

    system = prompts.MEMO_FACTS_SYSTEM

    def prompt(self, claim: str, hits: list[Any]) -> str:
        return text.build_prompt(claim, hits)


def run(ctx: JobContext) -> dict[str, Any]:
    draft_id = ctx.job.payload["draft_id"]
    with ctx.read_session() as db:
        draft = db.get(Draft, draft_id)
        memo = draft is not None and draft.type == "memo"
    ctx.progress(5, "Reading the incoming document", code="reading")
    ctx.progress(10, "Framing the question presented" if memo else "Listing each point in the letter", code="claims")
    ctx.progress(30, "Finding supporting facts", code="retrieving")
    ctx.progress(50, "Drafting the memo" if memo else "Drafting the response", code="drafting")
    local = ctx.settings.orchestrator == "local"
    respond = Responder(ctx) if local and not memo else None
    narrate = FactsWriter(ctx) if local and memo else None
    embedder = get_embedder(ctx.settings)
    # Compose in a read session: model calls take seconds to minutes, and SQLite has one writer. Holding the
    # write lock through them would make every other write in the app (chat, uploads, progress) time out.
    with ctx.read_session() as db:
        draft = db.get(Draft, draft_id)
        if draft is None:
            raise JobError("draft_missing", "The draft was deleted.")
        content = drafts.compose(db, draft, embedder, respond, narrate)
    ctx.progress(80, "Applying the safeguards", code="safeguards")
    with ctx.session() as db:
        draft = db.get(Draft, draft_id)
        if draft is None:
            raise JobError("draft_missing", "The draft was deleted.")
        writer = respond or narrate
        if writer is not None and writer.written:
            version = drafts.finish(
                db, draft, content, model_id=writer.model, prompt_version=prompts.DRAFT_PROMPT_VERSION
            )
        else:
            version = drafts.finish(db, draft, content)
        version_no, title = version.version, draft.title
    ctx.progress(90, "Checking citations", code="verifying")
    return {
        "kind": "draft",
        "id": draft_id,
        "url": result_url("draft", draft_id, ctx.job.id),
        "version": version_no,
        "title": title,
    }


def on_failure(ctx: JobContext, code: str, message: str) -> None:
    with ctx.session() as db:
        draft = db.get(Draft, ctx.job.payload.get("draft_id"))
        if draft is not None and draft.status == "generating":
            draft.status = "failed"


HANDLER = Handler(run=run, on_failure=on_failure)
