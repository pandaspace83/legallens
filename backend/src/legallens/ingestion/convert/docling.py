"""Docling conversion (TA frame 6 step 7): layout model, TableFormer and Tesseract OCR, all on this machine.

Models load from LEGALLENS_DOCLING_ARTIFACTS (downloaded once by `legallens models download`), and Hugging Face
is forced offline, so ingestion never makes a network call (DEC-56).
"""

import math
import os
from pathlib import Path
from threading import Lock
from typing import Any

from legallens.config import Settings
from legallens.ingestion.convert import Block, Converted, PageInfo, Progress, paginate_virtual
from legallens.ingestion.triage import triage_pdf

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

_KIND = {
    "title": "heading",
    "section_header": "heading",
    "list_item": "list_item",
    "table": "table",
    "footnote": "footnote",
    "caption": "caption",
    "page_header": "page_header",
    "page_footer": "page_footer",
}
_SKIP = {"picture", "chart", "formula", "checkbox_selected", "checkbox_unselected"}

_converters: dict[tuple[str, str], Any] = {}
_lock = Lock()


def _build_converter(settings: Settings) -> Any:
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TesseractCliOcrOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    options = PdfPipelineOptions(
        artifacts_path=str(settings.docling_artifacts_path.resolve()),
        do_ocr=True,
        do_table_structure=True,
        generate_page_images=False,
        enable_remote_services=False,
        ocr_options=TesseractCliOcrOptions(lang=[settings.ocr_lang]),
    )
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF, InputFormat.DOCX],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
    )


def get_docling(settings: Settings) -> Any:
    key = (str(settings.docling_artifacts_path), settings.ocr_lang)
    with _lock:
        if key not in _converters:
            _converters[key] = _build_converter(settings)
        return _converters[key]


_BULLETS = {"", "•", "-", "*", "–", "·", "o", "▪"}


def _text_of(item: Any, doc: Any) -> str:
    label = item.label.value if hasattr(item.label, "value") else str(item.label)
    if label == "table":
        return str(item.export_to_markdown(doc=doc))
    text = str(getattr(item, "text", "") or "")
    # Docling moves list numbering ("4.1", "(a)") into `marker`. Clause numbers are the pinpoint in a contract
    # (DEC-36, DEC-67), so put them back in front of the text.
    marker = str(getattr(item, "marker", "") or "").strip()
    if label == "list_item" and marker not in _BULLETS and not text.startswith(marker):
        text = f"{marker} {text}"
    return text


class DoclingConverter:
    name = "docling"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def convert(self, path: Path, kind: str, progress: Progress) -> Converted:
        triage = {t.page_no: t for t in triage_pdf(path)} if kind == "pdf" else {}
        total = len(triage)
        scanned = sum(1 for t in triage.values() if not t.has_text_layer)
        if scanned:
            progress(22, f"OCR on {scanned} scanned {'page' if scanned == 1 else 'pages'}")
        progress(25, f"Reading pages 1 of {total}" if total else "Reading the document")
        result = get_docling(self.settings).convert(str(path), max_num_pages=self.settings.max_pages)
        doc = result.document
        progress(55, f"Reading pages {total} of {total}" if total else "Reading the document")

        if kind != "pdf":
            paragraphs: list[tuple[str, str, int | None]] = []
            for item, _level in doc.iterate_items():
                label = item.label.value
                if label in _SKIP:
                    continue
                text = _text_of(item, doc).strip()
                if text:
                    paragraphs.append((_KIND.get(label, "text"), text, getattr(item, "level", None)))
            converted = paginate_virtual(paragraphs)
            converted.converter = "docling"
            return converted

        pages: list[PageInfo] = []
        confidence_pages = getattr(getattr(result, "confidence", None), "pages", {}) or {}
        for page_no in sorted(triage):
            t = triage[page_no]
            ocr_used = not t.has_text_layer
            score = None
            if ocr_used and page_no in confidence_pages:
                raw = getattr(confidence_pages[page_no], "ocr_score", None)
                score = round(float(raw), 3) if raw is not None and not math.isnan(float(raw)) else None
            pages.append(PageInfo(page_no, t.width, t.height, t.has_text_layer, ocr_used, score))

        blocks: list[Block] = []
        for item, _level in doc.iterate_items():
            label = item.label.value
            if label in _SKIP or not getattr(item, "prov", None):
                continue
            text = _text_of(item, doc).strip()
            if not text:
                continue
            prov = item.prov[0]
            page_height = doc.pages[prov.page_no].size.height
            box = prov.bbox.to_top_left_origin(page_height=page_height)
            blocks.append(
                Block(
                    prov.page_no,
                    _KIND.get(label, "text"),
                    text,
                    [round(box.l, 2), round(box.t, 2), round(box.r, 2), round(box.b, 2)],
                    getattr(item, "level", None),
                )
            )
        return Converted(pages=pages, blocks=blocks, converter="docling")
