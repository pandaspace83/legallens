"""Coverage report (DEC-42): what was actually read, e.g. "212 of 214 pages read; pp. 37 and 88 unreadable"."""

from typing import Any

from legallens.ingestion.convert import PageInfo
from legallens.ingestion.legal import Unit

MIN_OCR_CONFIDENCE_TO_READ = 0.5


def pages_phrase(pages: list[int]) -> str:
    if len(pages) == 1:
        return f"p. {pages[0]}"
    shown = [str(p) for p in pages[:10]]
    more = f" and {len(pages) - 10} more" if len(pages) > 10 else ""
    if more:
        return "pp. " + ", ".join(shown) + more
    return "pp. " + ", ".join(shown[:-1]) + f" and {shown[-1]}"


def build(pages: list[PageInfo], units: list[Unit], low_confidence: float) -> dict[str, Any]:
    with_text = {u.block.page for u in units if len(u.block.text.strip()) >= 3}
    read: list[int] = []
    unreadable: list[int] = []
    for page in pages:
        too_poor = page.ocr_used and page.ocr_conf is not None and page.ocr_conf < MIN_OCR_CONFIDENCE_TO_READ
        (read if page.page_no in with_text and not too_poor else unreadable).append(page.page_no)
    ocr_pages = [p.page_no for p in pages if p.ocr_used]
    low = [
        {"page": p.page_no, "ocr_conf": p.ocr_conf}
        for p in pages
        if p.ocr_used and p.ocr_conf is not None and p.ocr_conf < low_confidence
    ]
    text = f"{len(read)} of {len(pages)} page{'s' if len(pages) != 1 else ''} read"
    if unreadable:
        text += f"; {pages_phrase(unreadable)} unreadable"
    if ocr_pages:
        text += f"; OCR on {pages_phrase(ocr_pages)}"
    if low:
        text += f"; low OCR confidence on {pages_phrase([x['page'] for x in low])}"  # type: ignore[misc]
    return {
        "pages_total": len(pages),
        "pages_read": len(read),
        "pages_unreadable": unreadable,
        "ocr_pages": ocr_pages,
        "low_confidence_pages": low,
        "text": text,
    }
