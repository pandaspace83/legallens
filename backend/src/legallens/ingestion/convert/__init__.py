"""Converters turn a (sanitized) file into pages and blocks in reading order, each block with its page box.

- DoclingConverter: layout model, TableFormer and Tesseract OCR (the default, TA frame 6 step 7).
- FastConverter: PyMuPDF text with positions, python-docx, and Tesseract for image-only pages; no layout model.
- TextConverter: plain text and email bodies, laid out on virtual Letter-size pages.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from legallens.config import Settings

LETTER = (612.0, 792.0)  # PDF points

Progress = Callable[[int, str], None]


@dataclass
class Block:
    page: int
    kind: str  # heading | text | list_item | table | footnote | caption | page_header | page_footer
    text: str
    bbox: list[float]  # [x0, y0, x1, y1], points, top-left origin
    level: int | None = None
    bold: bool = False
    font_size: float | None = None


@dataclass
class PageInfo:
    page_no: int
    width: float
    height: float
    has_text_layer: bool = True
    ocr_used: bool = False
    ocr_conf: float | None = None


@dataclass
class Converted:
    pages: list[PageInfo]
    blocks: list[Block]
    converter: str
    metadata: dict[str, Any] = field(default_factory=dict)


class Converter(Protocol):
    name: str

    def convert(self, path: Path, kind: str, progress: Progress) -> Converted: ...


def get_converter(settings: Settings) -> Converter:
    if settings.converter == "docling":
        from legallens.ingestion.convert.docling import DoclingConverter

        return DoclingConverter(settings)
    from legallens.ingestion.convert.fast import FastConverter

    return FastConverter(settings)


def paginate_virtual(paragraphs: list[tuple[str, str, int | None]], chars_per_page: int = 3000) -> Converted:
    """Lays (kind, text, level) paragraphs onto Letter pages, with synthetic boxes, for files without real pages."""
    width, height = LETTER
    margin, line_height, chars_per_line = 72.0, 14.0, 90
    pages: list[PageInfo] = []
    blocks: list[Block] = []
    page_no, used, y = 1, 0, margin
    pages.append(PageInfo(page_no, width, height))
    for kind, text, level in paragraphs:
        if not text.strip():
            continue
        lines = max(1, sum(max(1, -(-len(part) // chars_per_line)) for part in text.split("\n")))
        block_height = lines * line_height
        if (used + len(text) > chars_per_page or y + block_height > height - margin) and used > 0:
            page_no += 1
            pages.append(PageInfo(page_no, width, height))
            used, y = 0, margin
        blocks.append(
            Block(page_no, kind, text, [margin, y, width - margin, min(y + block_height, height - margin)], level)
        )
        used += len(text)
        y += block_height + line_height / 2
    return Converted(pages=pages, blocks=blocks, converter="virtual")
