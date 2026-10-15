"""Job handler: the full matter file as a .zip (DEC-33), so the lawyer can return or keep the client's file.

Contains the original documents, coverage reports, summaries, drafts (working copies with sources), every chat
as Markdown, the matter profile, the matter's audit log and a manifest.
"""

import io
import json
import re
import zipfile
from typing import Any

from sqlalchemy import select

from legallens import __version__
from legallens.db.models import AuditLog, Conversation, Document, Draft, Matter, Message, Summary
from legallens.db.scope import unscoped
from legallens.drafting.docx_export import build
from legallens.jobs.handlers import Handler
from legallens.jobs.queue import JobContext, JobError, result_url
from legallens.services import conversations, drafts, matters, summaries
from legallens.storage.files import open_store
from legallens.timeutil import iso, utcnow

_SAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def _safe(name: str) -> str:
    return _SAFE.sub("_", name).strip()[:120] or "file"


def _write_json(zf: zipfile.ZipFile, path: str, data: Any) -> None:
    zf.writestr(path, json.dumps(data, indent=2, ensure_ascii=False, default=str))


def run(ctx: JobContext) -> dict[str, Any]:
    settings = ctx.settings
    folder = settings.exports_dir / ctx.matter_id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{ctx.job.id}.zip"
    partial = target.with_suffix(".partial")
    store = open_store(settings)
    files: list[str] = []
    ctx.progress(5, "Collecting the matter", code="exporting")
    with ctx.read_session() as db, zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED) as zf:
        matter = db.get(Matter, ctx.matter_id)
        if matter is None:
            raise JobError("matter_missing", "The matter was deleted.")
        _write_json(zf, "matter.json", matters.to_out(db, matter).model_dump(mode="json"))
        files.append("matter.json")

        documents = list(db.execute(select(Document).order_by(Document.uploaded_at)).scalars())
        for i, d in enumerate(documents, start=1):
            if d.status != "quarantined":
                path = store.path(d.storage_path)
                if path.exists():
                    name = f"documents/{d.id}__{_safe(d.filename)}"
                    zf.writestr(name, store.read(d.storage_path))
                    files.append(name)
            if d.coverage_json:
                _write_json(zf, f"documents/{d.id}__coverage.json", d.coverage_json)
            ctx.progress(5 + int(45 * i / max(len(documents), 1)), "Adding documents", code="exporting")

        for s in db.execute(select(Summary)).scalars():
            _write_json(zf, f"summaries/{s.id}.json", summaries.to_out(s).model_dump(mode="json"))
            files.append(f"summaries/{s.id}.json")

        ctx.progress(60, "Adding drafts", code="exporting")
        for draft in db.execute(select(Draft)).scalars():
            out = drafts.to_out(db, draft)
            _write_json(zf, f"drafts/{draft.id}.json", out.model_dump(mode="json"))
            version = drafts.current(db, draft)
            if version is not None:
                payload = {
                    "type": draft.type,
                    "status": draft.status,
                    "sections": version.content_json.get("sections", []),
                    "safeguards": draft.safeguards_json or {},
                }
                name = f"drafts/{draft.id}-v{version.version}-working-copy.docx"
                zf.writestr(name, build(payload, kind="working", client_name=matter.client_name))
                files.append(name)

        ctx.progress(75, "Adding chat history", code="exporting")
        for conversation in db.execute(select(Conversation).order_by(Conversation.created_at)).scalars():
            messages = list(
                db.execute(
                    select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)
                ).scalars()
            )
            cites = conversations.citations_for(db, [m.id for m in messages])
            lines = [f"# {conversation.title or 'New chat'}", ""]
            for m in messages:
                lines.append(f"**{'You' if m.role == 'user' else 'LegalLens'}** · {iso(m.created_at)}")
                lines.append("")
                lines.append(m.content)
                for c in cites.get(m.id, []):
                    lines.append(f"[{c.n}] {c.document_name}, p. {c.page}{', ' + c.para_ref if c.para_ref else ''}")
                lines.append("")
            name = f"conversations/{conversation.id}.md"
            zf.writestr(name, "\n".join(lines))
            files.append(name)

        ctx.progress(90, "Adding the audit log", code="exporting")
        with unscoped(db):
            audit_rows = db.execute(select(AuditLog).where(AuditLog.matter_id == ctx.matter_id).order_by(AuditLog.id))
            zf.writestr(
                "audit.jsonl",
                "".join(
                    json.dumps(
                        {
                            "id": r.id,
                            "ts": iso(r.ts),
                            "action": r.action,
                            "entity_type": r.entity_type,
                            "entity_id": r.entity_id,
                            "details": r.details_json,
                            "prev_hash": r.prev_hash,
                            "hash": r.hash,
                        }
                    )
                    + "\n"
                    for r in audit_rows.scalars()
                ),
            )
        files.append("audit.jsonl")
        _write_json(
            zf,
            "manifest.json",
            {
                "matter_id": ctx.matter_id,
                "matter_name": matter.name,
                "exported_at": iso(utcnow()),
                "app_version": __version__,
                "files": files,
            },
        )
    partial.replace(target)
    target.chmod(0o600)
    return {"kind": "export", "id": ctx.job.id, "url": result_url("export", ctx.job.id, ctx.job.id)}


HANDLER = Handler(run=run)

__all__ = ["HANDLER", "io"]
