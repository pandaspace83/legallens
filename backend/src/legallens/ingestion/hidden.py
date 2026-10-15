"""Hidden content (DEC-59, RISK-07): detect it, record it, and convert a sanitized copy so no model ever sees it.

PDF: white or invisible text, tiny text, annotations (comments), embedded files, identifying metadata.
DOCX: tracked changes, comments, hidden (vanish), white or tiny text, document properties.

The original file is never changed. The sanitized copy keeps the visible text exactly where it was, so page
boxes and citations still line up with the original.
"""

import shutil
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pymupdf
from lxml import etree

from legallens.ingestion.triage import image_coverage

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
_TEXT_LIMIT = 500
_IDENTIFYING_PDF_METADATA = ("author", "title", "subject", "keywords")
_DOCX_TEXT_PARTS = ("word/document.xml", "word/footnotes.xml", "word/endnotes.xml")


@dataclass
class HiddenReport:
    counts: dict[str, int] = field(default_factory=dict)
    items: list[dict[str, Any]] = field(default_factory=list)

    def add(self, kind: str, location: str, text: str | None = None, page: int | None = None) -> None:
        self.counts[kind] = self.counts.get(kind, 0) + 1
        if len(self.items) < 500:
            snippet = " ".join(text.split())[:_TEXT_LIMIT] if text else None
            self.items.append({"kind": kind, "page": page, "location": location, "text": snippet})

    def as_json(self) -> dict[str, Any] | None:
        return {"counts": self.counts, "items": self.items} if self.counts else None


# ---------------------------------------------------------------- PDF


def _is_white(color: Any) -> bool:
    if isinstance(color, int):
        r, g, b = (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF
        return min(r, g, b) >= 0xF0
    if isinstance(color, (tuple, list)) and len(color) >= 3:
        return min(color[:3]) >= 0.94
    return False


def sanitize_pdf(source: Path, target: Path) -> HiddenReport:
    report = HiddenReport()
    with pymupdf.open(source) as doc:
        meta = doc.metadata or {}
        present = [key for key in _IDENTIFYING_PDF_METADATA if (meta.get(key) or "").strip()]
        if present:
            report.add("metadata", "document properties", ", ".join(f"{k}: {meta[k]}" for k in present))
        if doc.embfile_count():
            for name in doc.embfile_names():
                report.add("embedded_files", "embedded file", name)
        for page_no, page in enumerate(doc, start=1):
            scanned_with_text_layer = image_coverage(page) >= 0.5
            rects: list[pymupdf.Rect] = []
            for trace in page.get_texttrace():
                text = "".join(chr(c[0]) for c in trace["chars"]).strip()
                if not text:
                    continue
                bbox = pymupdf.Rect(trace["bbox"])
                invisible = trace.get("type") == 3 or trace.get("opacity", 1.0) == 0
                if invisible and scanned_with_text_layer:
                    continue  # the OCR layer of a scanned page: legitimate, keep it
                kind = None
                if invisible:
                    kind = "hidden_text"
                elif _is_white(trace.get("color")):
                    kind = "white_text"
                elif trace.get("size", 12) < 2:
                    kind = "tiny_text"
                elif not bbox.intersects(page.rect):
                    kind = "hidden_text"
                if kind:
                    report.add(kind, f"page {page_no}", text, page_no)
                    rects.append(bbox)
            for annot in page.annots() or []:
                content = (annot.info or {}).get("content") or ""
                report.add("annotations", f"page {page_no} {annot.type[1].lower()}", content or None, page_no)
            for annot in list(page.annots() or []):
                page.delete_annot(annot)
            for rect in rects:
                inset = pymupdf.Rect(rect.x0 + 0.5, rect.y0 + 0.5, rect.x1 - 0.5, rect.y1 - 0.5)
                page.add_redact_annot(inset if not inset.is_empty else rect, fill=False, cross_out=False)
            if rects:
                page.apply_redactions(
                    images=pymupdf.PDF_REDACT_IMAGE_NONE,  # type: ignore[attr-defined]
                    graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,  # type: ignore[attr-defined]
                    text=pymupdf.PDF_REDACT_TEXT_REMOVE,  # type: ignore[attr-defined]
                )
        for name in list(doc.embfile_names()):
            doc.embfile_del(name)
        doc.set_metadata({})
        doc.del_xml_metadata()
        doc.save(target, garbage=3, deflate=True)
    return report


# ---------------------------------------------------------------- DOCX


def _texts(el: etree._Element) -> str:
    return "".join(el.itertext())


def _run_hidden_kind(run: etree._Element) -> str | None:
    rpr = run.find("w:rPr", NS)
    if rpr is None:
        return None
    vanish = rpr.find("w:vanish", NS)
    if vanish is not None and vanish.get(f"{{{W}}}val", "true").lower() not in ("0", "false", "off"):
        return "hidden_text"
    color = rpr.find("w:color", NS)
    if color is not None and (color.get(f"{{{W}}}val") or "").upper() in ("FFFFFF", "FEFEFE"):
        return "white_text"
    size = rpr.find("w:sz", NS)
    if size is not None and (size.get(f"{{{W}}}val") or "").isdigit() and int(size.get(f"{{{W}}}val")) < 4:
        return "tiny_text"
    return None


def _clean_part(xml: bytes, report: HiddenReport, location: str) -> bytes:
    root = etree.fromstring(xml)
    for tag in ("del", "moveFrom"):
        for el in root.iter(f"{{{W}}}{tag}"):
            report.add("tracked_changes", f"{location}: deletion", _texts(el) or None)
    for tag in ("ins", "moveTo"):
        for el in root.iter(f"{{{W}}}{tag}"):
            if el.getparent() is not None and el.getparent().tag != f"{{{W}}}rPr":
                report.add("tracked_changes", f"{location}: insertion", _texts(el) or None)
    # Deleted text goes; inserted text stays, as the document now reads.
    for tag in ("del", "moveFrom"):
        for el in list(root.iter(f"{{{W}}}{tag}")):
            parent = el.getparent()
            if parent is not None and parent.tag != f"{{{W}}}rPr":
                parent.remove(el)
    for tag in ("ins", "moveTo"):
        for el in list(root.iter(f"{{{W}}}{tag}")):
            parent = el.getparent()
            if parent is None or parent.tag == f"{{{W}}}rPr":
                continue
            index = parent.index(el)
            for child in list(el):
                parent.insert(index, child)
                index += 1
            parent.remove(el)
    for run in list(root.iter(f"{{{W}}}r")):
        kind = _run_hidden_kind(run)
        if kind:
            report.add(kind, location, _texts(run) or None)
            run.getparent().remove(run)  # type: ignore[union-attr]
            continue
        if run.find("w:commentReference", NS) is not None:
            run.getparent().remove(run)  # type: ignore[union-attr]
    for tag in ("commentRangeStart", "commentRangeEnd"):
        for el in list(root.iter(f"{{{W}}}{tag}")):
            el.getparent().remove(el)  # type: ignore[union-attr]
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


_EMPTY_CORE = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    b'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    b'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    b'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>'
)


def sanitize_docx(source: Path, target: Path) -> HiddenReport:
    report = HiddenReport()
    with zipfile.ZipFile(source) as src:
        names = src.namelist()
        if "word/comments.xml" in names:
            comments = etree.fromstring(src.read("word/comments.xml"))
            for comment in comments.iter(f"{{{W}}}comment"):
                author = comment.get(f"{{{W}}}author") or "unknown"
                report.add("comments", f"comment by {author}", _texts(comment) or None)
        if "docProps/core.xml" in names:
            core = etree.fromstring(src.read("docProps/core.xml"))
            filled = [
                f"{etree.QName(el).localname}: {el.text.strip()}"
                for el in core
                if el.text and el.text.strip() and etree.QName(el).localname not in ("created", "modified", "revision")
            ]
            if filled:
                report.add("metadata", "document properties", "; ".join(filled))
        if "docProps/custom.xml" in names:
            report.add(
                "metadata", "custom properties", _texts(etree.fromstring(src.read("docProps/custom.xml"))) or None
            )
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                data = src.read(info.filename)
                if info.filename in (
                    "word/comments.xml",
                    "word/commentsExtended.xml",
                    "word/commentsIds.xml",
                    "word/commentsExtensible.xml",
                    "docProps/custom.xml",
                ):
                    continue
                if info.filename in _DOCX_TEXT_PARTS or info.filename.startswith(("word/header", "word/footer")):
                    data = _clean_part(data, report, info.filename.removeprefix("word/").removesuffix(".xml"))
                elif info.filename == "docProps/core.xml":
                    data = _EMPTY_CORE
                elif info.filename.endswith(".rels") or info.filename == "[Content_Types].xml":
                    data = _drop_references(data)
                dst.writestr(info, data)
    return report


def _drop_references(xml: bytes) -> bytes:
    """Removes relationships and content-type overrides that point at the parts dropped above."""
    root = etree.fromstring(xml)
    for el in list(root):
        target = (el.get("Target") or el.get("PartName") or "").lower()
        if any(part in target for part in ("comments", "custom.xml")):
            root.remove(el)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def sanitize(source: Path, kind: str, workdir: Path) -> tuple[Path, HiddenReport]:
    target = workdir / f"sanitized.{kind}"
    if kind == "pdf":
        return target, sanitize_pdf(source, target)
    if kind == "docx":
        return target, sanitize_docx(source, target)
    shutil.copy(source, target)
    return target, HiddenReport()
