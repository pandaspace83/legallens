"""Local OCR with the Tesseract CLI (DEC-08): page image in, paragraphs with boxes and a confidence score out.

Pages are rendered at 300 DPI in grayscale. Confidence is the mean word confidence (0–1). Poor scans and
handwriting are V1.x (DEF-16); low-confidence pages are flagged in the coverage report instead.
"""

import csv
import io
import shutil
import subprocess
from dataclasses import dataclass, field

import pymupdf

from legallens.ingestion.convert import Block

DPI = 300
TIMEOUT_SECONDS = 180


class OcrUnavailable(RuntimeError):
    pass


@dataclass
class _Paragraph:
    bbox: list[float]
    lines: dict[int, list[str]] = field(default_factory=dict)


@dataclass
class OcrResult:
    blocks: list[Block]
    confidence: float | None


def tesseract_path() -> str:
    path = shutil.which("tesseract") or (
        "/opt/homebrew/bin/tesseract" if shutil.which("/opt/homebrew/bin/tesseract") else None
    )
    if not path:
        raise OcrUnavailable("Tesseract is not installed.")
    return path


def ocr_page(page: pymupdf.Page, page_no: int, lang: str = "eng") -> OcrResult:
    pixmap = page.get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    image = pixmap.tobytes("png")
    completed = subprocess.run(
        [tesseract_path(), "stdin", "stdout", "-l", lang, "--psm", "3", "tsv"],
        input=image,
        capture_output=True,
        timeout=TIMEOUT_SECONDS,
        check=False,
    )
    if completed.returncode != 0:
        raise OcrUnavailable("Tesseract failed on a page.")
    scale = 72.0 / DPI
    paragraphs: dict[tuple[int, int], _Paragraph] = {}
    confidences: list[float] = []
    reader = csv.DictReader(
        io.StringIO(completed.stdout.decode("utf-8", "replace")), delimiter="\t", quoting=csv.QUOTE_NONE
    )
    for row in reader:
        text = (row.get("text") or "").strip()
        if row.get("level") != "5" or not text:
            continue
        conf = float(row.get("conf") or -1)
        if conf >= 0:
            confidences.append(conf / 100)
        left, top = int(row["left"]) * scale, int(row["top"]) * scale
        right, bottom = left + int(row["width"]) * scale, top + int(row["height"]) * scale
        para = paragraphs.setdefault(
            (int(row["block_num"]), int(row["par_num"])), _Paragraph([left, top, right, bottom])
        )
        para.bbox = [
            min(para.bbox[0], left),
            min(para.bbox[1], top),
            max(para.bbox[2], right),
            max(para.bbox[3], bottom),
        ]
        para.lines.setdefault(int(row["line_num"]), []).append(text)
    blocks = []
    for para in sorted(paragraphs.values(), key=lambda p: (p.bbox[1], p.bbox[0])):
        lines = [" ".join(words) for _, words in sorted(para.lines.items())]
        blocks.append(Block(page_no, "text", "\n".join(lines), [round(v, 2) for v in para.bbox]))
    confidence = round(sum(confidences) / len(confidences), 3) if confidences else None
    return OcrResult(blocks, confidence)
