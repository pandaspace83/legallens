"""PDF page triage (TA frame 6 step 6): which pages have a text layer and which are only an image.

Done one page at a time, so a digital PDF with one faxed signature page still gets that page OCR'd.
"""

from dataclasses import dataclass
from pathlib import Path

import pymupdf

MIN_TEXT_CHARS = 20
SCANNED_BODY_CHARS = 200
MARGIN_BAND = 0.07


@dataclass(frozen=True)
class PageTriage:
    page_no: int
    width: float
    height: float
    has_text_layer: bool
    image_coverage: float


def image_coverage(page: pymupdf.Page) -> float:
    area = page.rect.width * page.rect.height or 1.0
    covered = 0.0
    for info in page.get_image_info():
        rect = pymupdf.Rect(info["bbox"]) & page.rect
        covered += rect.width * rect.height
    return min(1.0, covered / area)


def body_text_chars(page: pymupdf.Page) -> int:
    """Characters of text outside the top and bottom margins, where stamps, footers and Bates numbers sit."""
    top, bottom = page.rect.height * MARGIN_BAND, page.rect.height * (1 - MARGIN_BAND)
    total = 0
    for _x0, y0, _x1, y1, text, *_ in page.get_text("blocks"):
        if y1 > top and y0 < bottom:
            total += len(text.strip())
    return total


def needs_ocr(page: pymupdf.Page, coverage: float | None = None) -> bool:
    """A page needs OCR when its body has no real text layer: either almost no text at all, or a page-sized image
    with only a stamped footer or Bates number on top (a faxed or scanned page inside a digital PDF)."""
    body = body_text_chars(page)
    coverage = image_coverage(page) if coverage is None else coverage
    return body < MIN_TEXT_CHARS or (coverage >= 0.6 and body < SCANNED_BODY_CHARS)


def triage_pdf(path: Path) -> list[PageTriage]:
    out = []
    with pymupdf.open(path) as pdf:
        for index, page in enumerate(pdf, start=1):
            coverage = image_coverage(page)
            out.append(
                PageTriage(
                    page_no=index,
                    width=round(page.rect.width, 2),
                    height=round(page.rect.height, 2),
                    has_text_layer=not needs_ocr(page, coverage),
                    image_coverage=round(coverage, 3),
                )
            )
    return out
