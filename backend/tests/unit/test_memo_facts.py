from typing import Any

from legallens.drafting import templates


def chunk(seq: int, text: str) -> dict[str, Any]:
    return {
        "chunk_id": seq, "document_id": "d", "document_name": "opinion.pdf", "text": text,
        "page": seq, "para_ref": None, "bbox": [], "seq": seq,
    }  # fmt: skip


CHUNKS = [
    chunk(1, "Cover page of the opinion."),
    chunk(2, "Counsel for appellee."),
    chunk(3, "Background facts of the case."),
]


def build(instructions: str, found: list[dict[str, Any]]) -> dict[str, Any]:
    return templates.memo(
        matter={"name": "M", "client_name": "C"},
        incoming_name="opinion.pdf",
        incoming_chunks=CHUNKS,
        find_facts=lambda _text: [],
        instructions=instructions,
        find_in_incoming=lambda _text: found,
    )


def facts(content: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in content["sections"] if s["kind"] == "facts")


def test_the_facts_come_from_the_passages_that_match_the_instruction() -> None:
    section = facts(build("memo on the background", [chunk(3, "Background facts of the case.")]))
    assert [c["chunk_id"] for c in section["citations"]] == [3]


def test_with_no_instruction_the_facts_come_from_the_documents_opening() -> None:
    section = facts(build("", [chunk(3, "Background facts of the case.")]))
    assert [c["chunk_id"] for c in section["citations"]] == [1, 2, 3]
