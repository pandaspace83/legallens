"""Legal structure (TA frame 6 step 8, DEC-67).

Over the converted blocks, in reading order:
- drops running page headers and footers, and moves Bates stamps into metadata
- tracks the heading path (Article 4 › 4.2 Notice) and the clause reference of every paragraph, e.g. 4.2(b)(iii)
- assigns a pinpoint to each paragraph: its clause reference, or ¶n when it has none
- finds defined terms ("Effective Date" means …; (the "Agreement"))
"""

import re
from collections import Counter
from dataclasses import dataclass, field

from legallens.ingestion.convert import Block, PageInfo

_BATES = re.compile(r"\b[A-Z]{2,12}[_\- ]?\d{5,10}\b")
_PAGE_NUMBER = re.compile(r"^(?:page\s+)?-?\s*\d{1,4}\s*-?(?:\s+of\s+\d{1,4})?$", re.I)
_ARTICLE = re.compile(r"^(?:ARTICLE|Article)\s+([IVXLC]+|\d+)\b[.:\s-]*(.*)$")
_ATTACHMENT = re.compile(r"^(EXHIBIT|Exhibit|SCHEDULE|Schedule|ANNEX|Annex|APPENDIX|Appendix)\s+([A-Z0-9]{1,4})\b")
_SECTION = re.compile(r"^(?:Section|SECTION|§)\s*(\d+(?:\.\d+)*)\.?\s*(.*)$")
_NUMBERED = re.compile(r"^(\d+(?:\.\d+)*)\.?\s+(\S.*)$", re.S)
_SUBCLAUSE = re.compile(r"^\(([a-z]{1,2}|[ivxlc]{1,6}|\d{1,2})\)\s*")
_ROMAN = re.compile(r"^[ivxlc]+$")
_ROMAN_VALUES = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def roman_value(marker: str) -> int:
    total = 0
    for i, ch in enumerate(marker):
        value = _ROMAN_VALUES[ch]
        total += -value if i + 1 < len(marker) and _ROMAN_VALUES[marker[i + 1]] > value else value
    return total


def marker_type(marker: str, stack: list[tuple[str, str]]) -> str:
    """digit, alpha or roman. Single letters are ambiguous: (i) after (h) is a letter, (c) after (ii) is a letter,
    and (v) is roman only when it continues (iv)."""
    if marker.isdigit():
        return "digit"
    if not _ROMAN.match(marker):
        return "alpha"
    last_alpha = next((m for t, m in reversed(stack) if t == "alpha"), None)
    last_roman = next((m for t, m in reversed(stack) if t == "roman"), None)
    if len(marker) == 1:
        if marker == "i":
            return "alpha" if stack and stack[-1][0] == "alpha" and last_alpha == "h" else "roman"
        if last_roman is not None and roman_value(marker) == roman_value(last_roman) + 1:
            return "roman"
        return "alpha"
    return "roman"


_ADDRESSISH = re.compile(
    r"\b\d{5}(?:-\d{4})?\b|\b(?:Street|St\.|Avenue|Ave\.?|Road|Rd\.|Suite|Floor|Boulevard|Blvd\.?|Way|Lane|"
    r"Drive|Dr\.|Plaza|Parkway|Box)\b"
)
_DEFINED = [
    re.compile(r"[“\"]([A-Z][\w’'\- ]{1,60}?)[”\"]\s+(?:means|shall mean|has the meaning|refers to|is defined)"),
    re.compile(r"\((?:the\s+|each,?\s+an?\s+|an?\s+|hereinafter\s+(?:the\s+)?)?[“\"]([A-Z][\w’'\- ]{1,60}?)[”\"]\)"),
]


@dataclass
class Unit:
    """One block after structure analysis."""

    block: Block
    kind: str  # heading | text | list_item | table | footnote | caption
    section: list[str]  # heading path
    clause_ref: str | None
    para_ref: str
    defines: list[str] = field(default_factory=list)


@dataclass
class Structure:
    units: list[Unit]
    defined_terms: list[tuple[str, int]]  # (term, index into units)
    bates: list[dict[str, object]]
    furniture: int  # header/footer blocks dropped


def _shape(text: str) -> str:
    return re.sub(r"\d+", "#", " ".join(text.lower().split()))


def _furniture(blocks: list[Block], pages: dict[int, PageInfo]) -> set[int]:
    """Indexes of running headers and footers: labelled by the layout model, or short blocks in the top or
    bottom 7% of a page whose shape repeats on several pages, or a bare page number."""
    marked: set[int] = set()
    candidates: dict[int, str] = {}
    for i, b in enumerate(blocks):
        if b.kind in ("page_header", "page_footer"):
            marked.add(i)
            continue
        page = pages.get(b.page)
        if page is None or len(b.text) > 120:
            continue
        top, bottom = b.bbox[1], b.bbox[3]
        if top < page.height * 0.07 or bottom > page.height * 0.93:
            if _PAGE_NUMBER.match(b.text.strip()):
                marked.add(i)
            else:
                candidates[i] = _shape(b.text)
    repeats = Counter(candidates.values())
    page_count = len(pages)
    threshold = 2 if page_count <= 4 else max(2, int(page_count * 0.3))
    marked.update(i for i, shape in candidates.items() if repeats[shape] >= threshold)
    return marked


def _heading_level(text: str, block: Block) -> tuple[int, str | None] | None:
    """(level, clause number) if the block is a heading."""
    clean = " ".join(text.split())
    if m := _ATTACHMENT.match(clean):
        return 1, f"{m.group(1).capitalize()} {m.group(2)}"
    if m := _ARTICLE.match(clean):
        return 1, m.group(1)
    short = (len(clean) <= 100 and not clean.endswith((".", ";", ","))) or len(clean) <= 60
    if (m := _SECTION.match(clean)) and short:
        return m.group(1).count(".") + 1, m.group(1)
    if block.kind == "heading":
        labelled = _NUMBERED.match(clean)
        level = block.level or (labelled.group(1).count(".") + 1 if labelled else 1)
        return level, labelled.group(1) if labelled else None
    # A short numbered line is a heading only if it isn't a sentence: "4.2 Termination" yes, "2.1 Fees are due." no.
    numbered = _NUMBERED.match(clean)
    if numbered and len(clean) <= 80 and not clean.endswith((".", ";", ":", ",")) and numbered.group(2)[:1].isupper():
        number = numbered.group(1)
        # "4.2 Notice" is a heading; "100 Market Street, Suite 400" is an address line.
        plain_number_ok = "." in number or (int(number) <= 99 and not _ADDRESSISH.search(clean))
        if plain_number_ok:
            return number.count(".") + 1, number
    letters = [c for c in clean if c.isalpha()]
    if 2 <= len(clean.split()) <= 10 and letters and all(c.isupper() for c in letters) and len(clean) <= 80:
        return 1, None
    return None


def analyse(blocks: list[Block], pages: list[PageInfo]) -> Structure:
    by_page = {p.page_no: p for p in pages}
    furniture = _furniture(blocks, by_page)
    bates: list[dict[str, object]] = []
    for i in furniture:
        for match in _BATES.finditer(blocks[i].text):
            bates.append({"page": blocks[i].page, "value": match.group(0)})

    units: list[Unit] = []
    terms: list[tuple[str, int]] = []
    heading_stack: list[tuple[int, str, bool]] = []  # (level, title, numbered)
    base_clause: str | None = None
    sub_stack: list[tuple[str, str]] = []  # (marker type, marker)
    paragraph_no = 0

    for i, block in enumerate(blocks):
        if i in furniture:
            continue
        text = block.text.strip()
        if not text:
            continue
        # A Bates stamp alone in a block (outside the margins) is metadata too.
        if _BATES.fullmatch(text):
            bates.append({"page": block.page, "value": text})
            continue

        if block.kind in ("table", "footnote", "caption"):
            paragraph_no += 1
            units.append(Unit(block, block.kind, [t for _, t, _ in heading_stack], None, f"¶{paragraph_no}"))
            continue

        heading = _heading_level(text, block) if block.kind in ("heading", "text") else None
        if heading is not None:
            level, number = heading
            title = " ".join(text.split())
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title[:120], bool(number and number[0].isdigit())))
            if number and number[0].isdigit():
                base_clause = number
            elif level == 1:
                base_clause = number if number and not number[0].isdigit() else None
            sub_stack = []
            units.append(
                Unit(block, "heading", [t for _, t, _ in heading_stack], base_clause, base_clause or title[:40])
            )
            continue

        clause_ref = None
        numbered = _NUMBERED.match(text)
        if numbered and numbered.group(1).count(".") >= 1:
            base_clause = numbered.group(1)
            # "4.3 …" ends the "4.2 …" subsection: close numbered headings at its level or deeper.
            level = base_clause.count(".") + 1
            while heading_stack and heading_stack[-1][2] and heading_stack[-1][0] >= level:
                heading_stack.pop()
            sub_stack = []
            clause_ref = base_clause
        elif sub := _SUBCLAUSE.match(text):
            marker = sub.group(1)
            kind = marker_type(marker, sub_stack)
            types = [t for t, _ in sub_stack]
            if kind in types:
                sub_stack = sub_stack[: types.index(kind)]
            sub_stack.append((kind, marker))
            clause_ref = (base_clause or "") + "".join(f"({m})" for _, m in sub_stack)
        elif base_clause:
            clause_ref = base_clause + "".join(f"({m})" for _, m in sub_stack)

        paragraph_no += 1
        unit = Unit(
            block,
            "list_item" if block.kind == "list_item" else "text",
            [t for _, t, _ in heading_stack],
            clause_ref,
            clause_ref or f"¶{paragraph_no}",
        )
        for pattern in _DEFINED:
            for match in pattern.finditer(text):
                term = match.group(1).strip()
                if 1 < len(term) <= 60 and term not in unit.defines:
                    unit.defines.append(term)
                    terms.append((term, len(units)))
        units.append(unit)

    return Structure(units=units, defined_terms=terms, bates=bates, furniture=len(furniture))
