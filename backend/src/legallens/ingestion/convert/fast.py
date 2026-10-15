"""Fast converter: PyMuPDF text with positions, Tesseract for image-only pages, python-docx for Word files.

No layout model, so headings come from type (bold or larger than body text) and tables from DOCX only. Used by
the test suite and selectable with LEGALLENS_CONVERTER=fast.
"""

import re
import statistics
from pathlib import Path

import pymupdf
from docx import Document as DocxDocument
from docx.table import Table
from docx.text.paragraph import Paragraph

from legallens.config import Settings
from legallens.ingestion.convert import Block, Converted, PageInfo, Progress, paginate_virtual
from legallens.ingestion.ocr import ocr_page
from legallens.ingestion.triage import needs_ocr

_BOLD_FLAG = 16
_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")


def _block_text(block: dict) -> tuple[str, bool, float]:  # type: ignore[type-arg]
    lines, bold_chars, total_chars, sizes = [], 0, 0, []
    for line in block.get("lines", []):
        spans = line.get("spans", [])
        text = "".join(s["text"] for s in spans)
        if text.strip():
            lines.append(text.strip())
        for s in spans:
            n = len(s["text"].strip())
            total_chars += n
            sizes.append(s["size"])
            if s["flags"] & _BOLD_FLAG or "bold" in s.get("font", "").lower():
                bold_chars += n
    text = _HYPHEN_BREAK.sub(r"\1\2", "\n".join(lines))
    return text, total_chars > 0 and bold_chars / total_chars > 0.6, statistics.mean(sizes) if sizes else 0.0


def pdf_blocks(path: Path, settings: Settings, progress: Progress) -> Converted:
    pages: list[PageInfo] = []
    blocks: list[Block] = []
    with pymupdf.open(path) as pdf:
        total = pdf.page_count
        raw: list[tuple[int, str, bool, float, list[float]]] = []
        for index, page in enumerate(pdf, start=1):
            info = PageInfo(index, round(page.rect.width, 2), round(page.rect.height, 2))
            if not needs_ocr(page):
                for block in page.get_text("dict", sort=True)["blocks"]:
                    if block.get("type") != 0:
                        continue
                    text, bold, size = _block_text(block)
                    if text.strip():
                        raw.append((index, text, bold, size, [round(v, 2) for v in block["bbox"]]))
            else:
                progress(int(20 + 40 * index / total), f"OCR on page {index} of {total}")
                info.has_text_layer = False
                info.ocr_used = True
                result = ocr_page(page, index, settings.ocr_lang)
                info.ocr_conf = result.confidence
                blocks.extend(result.blocks)
            pages.append(info)
            if index == total or index % 5 == 0:
                progress(int(20 + 40 * index / total), f"Reading pages {index} of {total}")
    body_sizes = [size for _, text, _, size, _ in raw if len(text) > 80 and size > 0]
    body = statistics.median(body_sizes) if body_sizes else 0.0
    for page_no, text, bold, size, bbox in raw:
        short = len(text) <= 120 and "\n" not in text.strip()
        heading = short and (bold or (body and size >= body * 1.15))
        blocks.append(Block(page_no, "heading" if heading else "text", text, bbox, bold=bold, font_size=size))
    blocks.sort(key=lambda b: (b.page, b.bbox[1], b.bbox[0]))
    return Converted(pages=pages, blocks=blocks, converter="fast")


def _table_text(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = [" ".join(c.text.split()) for c in row.cells]
        rows.append("| " + " | ".join(cells) + " |")
    if len(rows) > 1:
        rows.insert(1, "|" + "---|" * len(table.rows[0].cells))
    return "\n".join(rows)


def docx_blocks(path: Path) -> Converted:
    doc = DocxDocument(str(path))
    paragraphs: list[tuple[str, str, int | None]] = []
    for item in doc.iter_inner_content():
        if isinstance(item, Paragraph):
            text = item.text.strip()
            if not text:
                continue
            style = (item.style.name if item.style is not None else "") or ""
            if style.startswith("Heading") or style == "Title":
                level = int(style.split()[-1]) if style.split()[-1].isdigit() else 1
                paragraphs.append(("heading", text, level))
            elif style.startswith("List"):
                paragraphs.append(("list_item", text, None))
            else:
                paragraphs.append(("text", text, None))
        elif isinstance(item, Table):
            paragraphs.append(("table", _table_text(item), None))
    converted = paginate_virtual(paragraphs)
    converted.converter = "fast"
    return converted


class FastConverter:
    name = "fast"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def convert(self, path: Path, kind: str, progress: Progress) -> Converted:
        if kind == "pdf":
            return pdf_blocks(path, self.settings, progress)
        if kind == "docx":
            return docx_blocks(path)
        raise ValueError(f"FastConverter does not handle {kind}")
