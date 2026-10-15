"""Placeholders in drafts (DEC-48, DEC-50).

`[PLACEHOLDER: …]`, `[CITE NEEDED: …]` and `[RULE NEEDED: …]` block a clean export. `[UNVERIFIED: …]` marks an
authority that doesn't trace to a document with its full text; it is acknowledged in the checklist instead.
All-caps fact slots such as `[EFFECTIVE DATE]` or `[ATTORNEY NAME]` are placeholders too. Citation markers
like `[3]` (digits only) are not.
"""

import re
from typing import Any

PLACEHOLDER_RE = re.compile(
    r"\[(PLACEHOLDER|CITE NEEDED|RULE NEEDED|UNVERIFIED)(?::\s*([^\]]*))?\]|\[([A-Z][A-Z0-9 /&'.\-]{2,40})\]"
)
CITATION_MARKER_RE = re.compile(r"\s?\[(\d{1,3})\]")
UNVERIFIED_RE = re.compile(r"\[UNVERIFIED:\s*([^\]]*)\]")

_KINDS = {
    "PLACEHOLDER": "placeholder",
    "CITE NEEDED": "cite_needed",
    "RULE NEEDED": "rule_needed",
    "UNVERIFIED": "unverified",
}
BLOCKING_KINDS = frozenset({"placeholder", "cite_needed", "rule_needed"})


def find(text: str) -> list[dict[str, Any]]:
    found = []
    for match in PLACEHOLDER_RE.finditer(text):
        kind = _KINDS.get(match.group(1) or "", "placeholder")
        found.append({"token": match.group(0), "kind": kind, "offset": match.start()})
    return found


def scan_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for section in sections:
        for item in find(section.get("heading", "")) + find(section.get("content", "")):
            out.append({**item, "section_id": section["id"]})
    return out


def blocking(placeholders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [p for p in placeholders if p["kind"] in BLOCKING_KINDS]


def strip_citation_markers(text: str) -> str:
    return CITATION_MARKER_RE.sub("", text)


def unwrap_unverified(text: str) -> str:
    return UNVERIFIED_RE.sub(lambda m: m.group(1).strip(), text)
