"""Prefixed ULIDs: sortable by creation time and readable in logs (mat_…, doc_…, msg_…)."""

from ulid import ULID

PREFIXES = {
    "user": "usr",
    "matter": "mat",
    "conversation": "cnv",
    "message": "msg",
    "run": "run",
    "document": "doc",
    "job": "job",
    "summary": "sum",
    "draft": "drf",
    "draft_version": "dvr",
    "proposal": "prp",
    "export": "exp",
}


def new_id(kind: str) -> str:
    return f"{PREFIXES[kind]}_{ULID()}"
