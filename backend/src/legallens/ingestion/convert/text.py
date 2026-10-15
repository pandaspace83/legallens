"""Plain text and email bodies: paragraphs split on blank lines, laid out on virtual pages."""

import re

from legallens.ingestion.convert import Converted, paginate_virtual

_BLANK = re.compile(r"\n\s*\n")
_HEADINGISH = re.compile(
    r"^(?:ARTICLE|SECTION|EXHIBIT|SCHEDULE)\b|^\d+(?:\.\d+)*\.?\s+[A-Z][^.]{0,80}$|^[A-Z][A-Z0-9 ,&'\-]{3,80}$"
)


def decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            text = data.decode(encoding)
            if encoding == "utf-16" and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            return text
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def convert_text(text: str) -> Converted:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs: list[tuple[str, str, int | None]] = []
    for para in _BLANK.split(text):
        clean = para.strip()
        if not clean:
            continue
        single_line = "\n" not in clean
        kind = "heading" if single_line and len(clean) <= 90 and _HEADINGISH.match(clean) else "text"
        paragraphs.append((kind, clean, None))
    converted = paginate_virtual(paragraphs)
    converted.converter = "text"
    return converted
