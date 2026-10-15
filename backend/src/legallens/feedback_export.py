"""Turns the lawyer's feedback into candidate golden-set questions (NFR-07, SUG-07).

One JSON line per feedback row: the question that was asked, what the answer said and cited, what the lawyer
reported, and what the answer should have been. The file stays on this computer; a person reviews each line
before it joins `tests/slow/test_golden_set.py`, because it quotes client documents.
"""

import json
from pathlib import Path
from typing import Any

from sqlalchemy import text

from legallens.db.engine import Database

EXPECTED = {
    "helpful": "keep as a regression case: the answer was right",
    "wrong_citation": "found, with citations that support the claim; review the cited passages",
    "missed_something": "found, with the passage the answer missed",
    "should_be_not_found": "not_found",
}


def export_feedback(database: Database, target: Path) -> int:
    rows: list[dict[str, Any]] = []
    with database.read() as db:
        feedback = db.execute(
            text(
                "SELECT f.message_id, f.kind, f.note, f.created_at, m.conversation_id, m.content, m.answer_state, "
                "m.model_id, m.matter_id, m.created_at AS answered_at "
                "FROM feedback f JOIN messages m ON m.id = f.message_id ORDER BY f.created_at"
            )
        ).mappings()
        for item in list(feedback):
            question = db.execute(
                text(
                    "SELECT content FROM messages WHERE conversation_id = :c AND role = 'user' "
                    "AND created_at <= :t ORDER BY created_at DESC LIMIT 1"
                ),
                {"c": item["conversation_id"], "t": item["answered_at"]},
            ).scalar()
            cited = db.execute(
                text(
                    "SELECT d.filename, c.page, c.para_ref, c.quote, c.verified FROM message_citations c "
                    "JOIN documents d ON d.id = c.document_id WHERE c.message_id = :m ORDER BY c.n"
                ),
                {"m": item["message_id"]},
            ).mappings()
            rows.append(
                {
                    "question": question,
                    "answer": item["content"],
                    "answer_state": item["answer_state"],
                    "model": item["model_id"],
                    "feedback": item["kind"],
                    "note": item["note"],
                    "expected": EXPECTED.get(item["kind"], ""),
                    "cited": [dict(c) for c in cited],
                    "matter_id": item["matter_id"],
                    "message_id": item["message_id"],
                }
            )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    target.chmod(0o600)
    return len(rows)
