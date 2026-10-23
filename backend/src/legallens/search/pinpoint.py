"""Pinpoints inside a chunk: which paragraph a quote comes from, so a citation names the exact clause or ¶ and
highlights only that paragraph's box (DEC-36)."""

from typing import Any

# A model (or a PDF) may use curly quotes and en dashes where the stored text has straight ones, or the reverse.
_CANON = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "\u00a0": " "})
# A quotation can run across a paragraph break, so no single paragraph holds all of it: the start of the quote
# is searched at decreasing lengths until one paragraph holds it.
_NEEDLE_LENGTHS = (80, 50, 30)


def _norm(text: str) -> str:
    return " ".join(text.translate(_CANON).split()).lower()


def locate(chunk_text: str, boxes: list[dict[str, Any]], quote: str) -> dict[str, Any] | None:
    """The box entry (page, bbox, ref) whose paragraph contains the quote, or None if it can't be placed."""
    whole = _norm(quote)
    for length in _NEEDLE_LENGTHS:
        needle = whole[:length].strip()
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
