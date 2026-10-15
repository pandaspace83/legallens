"""Pinpoints inside a chunk: which paragraph a quote comes from, so a citation names the exact clause or ¶ and
highlights only that paragraph's box (DEC-36)."""

from typing import Any


def _norm(text: str) -> str:
    return " ".join(text.split()).lower()


def locate(chunk_text: str, boxes: list[dict[str, Any]], quote: str) -> dict[str, Any] | None:
    """The box entry (page, bbox, ref) whose paragraph contains the quote, or None if it can't be placed."""
    needle = _norm(quote)[:80]
    if not needle:
        return None
    for box in boxes:
        start, end = box.get("start"), box.get("end")
        if start is None or end is None:
            continue
        if needle in _norm(chunk_text[start:end]):
            return box
    return None


def pinpoint(
    chunk_text: str, boxes: list[dict[str, Any]], quote: str, page: int, para_ref: str | None
) -> tuple[int, str | None, list[dict[str, Any]]]:
    """(page, para_ref, boxes to highlight) for a quote; falls back to the chunk's first page and reference."""
    box = locate(chunk_text, boxes, quote)
    if box is None:
        return page, para_ref, boxes
    return int(box["page"]), box.get("ref") or para_ref, [box]
