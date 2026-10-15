"""Email (TA frame 6 step 5): split .eml and .msg files into headers, body and attachments.

The email itself is indexed as text. Each attachment goes back through validation and the malware scan as its
own document, linked to the email by parent_document_id (DEC-59, DEC-67).
"""

import html
import re
from dataclasses import dataclass, field
from email import policy
from email.parser import BytesParser
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

HEADERS = ("from", "to", "cc", "date", "subject")


@dataclass
class EmailParts:
    headers: dict[str, str]
    body: str
    attachments: list[tuple[str, bytes]] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def as_text(self) -> str:
        lines = [f"{k.capitalize()}: {v}" for k, v in self.headers.items() if v]
        return "\n".join(lines) + "\n\n" + self.body.strip()

    def metadata(self) -> dict[str, Any]:
        return {"email": {k: v for k, v in self.headers.items() if v}}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in ("script", "style", "head"):
            self._skip += 1
        elif tag in ("br", "p", "div", "li", "tr", "h1", "h2", "h3"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "head") and self._skip:
            self._skip -= 1
        elif tag in ("p", "div", "li", "tr"):
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def html_to_text(markup: str) -> str:
    parser = _TextExtractor()
    parser.feed(markup)
    text = html.unescape("".join(parser.parts))
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def parse_eml(path: Path) -> EmailParts:
    msg = BytesParser(policy=policy.default).parse(path.open("rb"))
    headers = {h: str(msg.get(h, "") or "") for h in HEADERS}
    body_part = msg.get_body(preferencelist=("plain", "html"))
    body = ""
    if body_part is not None:
        content = body_part.get_content()
        body = html_to_text(content) if body_part.get_content_type() == "text/html" else content
    attachments, skipped = [], []
    for part in msg.iter_attachments():
        name = part.get_filename() or "attachment"
        payload = part.get_payload(decode=True)
        if isinstance(payload, bytes) and payload:
            attachments.append((name, payload))
        else:
            skipped.append(name)
    return EmailParts(headers, body, attachments, skipped)


def parse_msg(path: Path) -> EmailParts:
    import extract_msg

    msg: Any = extract_msg.openMsg(str(path))
    try:
        headers = {
            "from": str(msg.sender or ""),
            "to": str(msg.to or ""),
            "cc": str(msg.cc or ""),
            "date": str(msg.date or ""),
            "subject": str(msg.subject or ""),
        }
        body = msg.body or ""
        if not body.strip() and getattr(msg, "htmlBody", None):
            raw = msg.htmlBody
            body = html_to_text(raw.decode("utf-8", "replace") if isinstance(raw, bytes) else str(raw))
        attachments, skipped = [], []
        for att in msg.attachments:
            name = getattr(att, "longFilename", None) or getattr(att, "shortFilename", None) or "attachment"
            data = getattr(att, "data", None)
            if isinstance(data, bytes) and data:
                attachments.append((name, data))
            else:
                skipped.append(name)  # embedded messages and links are not unpacked in the MVP
        return EmailParts(headers, body, attachments, skipped)
    finally:
        msg.close()


def parse(path: Path, kind: str) -> EmailParts:
    return parse_eml(path) if kind == "eml" else parse_msg(path)
