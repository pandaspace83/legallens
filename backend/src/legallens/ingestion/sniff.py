"""File type from bytes, never from the extension (DEC-59 allowlist): PDF, DOCX, EML, MSG and TXT only."""

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import olefile

_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_EMAIL_HEADER = re.compile(rb"^(from|to|cc|subject|date|received|message-id|mime-version|return-path|reply-to):", re.I)


@dataclass(frozen=True)
class FileType:
    kind: str  # pdf | docx | eml | msg | txt
    mime: str
    ext: str


PDF = FileType("pdf", "application/pdf", "pdf")
DOCX = FileType("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx")
EML = FileType("eml", "message/rfc822", "eml")
MSG = FileType("msg", "application/vnd.ms-outlook", "msg")
TXT = FileType("txt", "text/plain", "txt")


def _is_docx(path: Path) -> bool:
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
    except zipfile.BadZipFile:
        return False
    return "[Content_Types].xml" in names and "word/document.xml" in names


def _is_msg(path: Path) -> bool:
    try:
        with olefile.OleFileIO(str(path)) as ole:
            entries = ["/".join(e) for e in ole.listdir(streams=True, storages=True)]
    except OSError:
        return False
    return any(e.startswith("__substg1.0_") or e == "__properties_version1.0" for e in entries)


def _decodes_as_text(head: bytes) -> bool:
    if b"\x00" in head and not head.startswith((b"\xff\xfe", b"\xfe\xff")):
        return False
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            head.decode(encoding)
            return True
        except UnicodeDecodeError:
            continue
    # The head may end mid-character; accept if all but the last 3 bytes decode.
    try:
        head[:-3].decode("utf-8")
        return True
    except UnicodeDecodeError:
        return False


def _looks_like_email(head: bytes) -> bool:
    lines = [ln for ln in head.lstrip(b"\xef\xbb\xbf").splitlines()[:30] if ln.strip()]
    headers = sum(1 for ln in lines[:15] if _EMAIL_HEADER.match(ln))
    return headers >= 2


def sniff(path: Path) -> FileType | None:
    with path.open("rb") as fh:
        head = fh.read(8192)
    if not head:
        return None
    if b"%PDF-" in head[:1024]:
        return PDF
    if head.startswith(b"PK\x03\x04"):
        return DOCX if _is_docx(path) else None
    if head.startswith(_OLE_MAGIC):
        return MSG if _is_msg(path) else None
    if _decodes_as_text(head):
        return EML if _looks_like_email(head) else TXT
    return None
