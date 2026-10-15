"""Chunking (TA frame 6 step 9).

- Child chunks of 300–500 tokens with about 15% overlap, cut on clause boundaries where possible.
- The parent chunk is the whole section (stored, not indexed), used to expand a hit with its context.
- A table is never split. Footnotes are their own chunks.
- Each chunk carries a header such as "Smith MSA v3 › 4 Termination › 4.2(a)", which is indexed and embedded
  with the text so a search for the section name finds its clauses.
"""

import math
from dataclasses import dataclass, field
from typing import Any

from legallens.ingestion.legal import Unit
from legallens.search.sentences import split_sentences

MIN_TOKENS = 300
MAX_TOKENS = 500
OVERLAP = 0.15
PARENT_MAX_TOKENS = 6000


def count_tokens(text: str) -> int:
    """About 1.3 tokens per word for English legal text. Swapped for the embedding model's tokenizer later."""
    return max(1, math.ceil(len(text.split()) * 1.3))


@dataclass
class ChunkSpec:
    kind: str  # section | text | table | footnote
    section_path: str | None
    clause_ref: str | None
    para_ref: str | None
    header: str
    page_start: int
    page_end: int
    text: str
    token_count: int
    boxes: list[dict[str, Any]]
    parent: int | None = None  # index of the parent spec in the returned list
    unit_indexes: list[int] = field(default_factory=list)


def _header(doc_name: str, section: list[str], clause_ref: str | None) -> str:
    parts = [doc_name, *section]
    if clause_ref and not any(clause_ref in s for s in section):
        parts.append(clause_ref)
    return " › ".join(parts)


def _boxes(parts: list[tuple[Unit, str]]) -> list[dict[str, Any]]:
    """One entry per paragraph in the chunk: its page, box, pinpoint, and where its text sits in the chunk text
    (paragraphs are joined with a blank line). A citation uses this to point at the exact paragraph (DEC-36)."""
    out: list[dict[str, Any]] = []
    offset = 0
    for u, text in parts:
        out.append(
            {"page": u.block.page, "bbox": u.block.bbox, "ref": u.para_ref, "start": offset, "end": offset + len(text)}
        )
        offset += len(text) + 2
    return out


def _tail(text: str, max_tokens: int) -> str:
    """The last sentences of a paragraph, up to max_tokens: the overlap repeated at the start of the next chunk."""
    sentences = split_sentences(text)
    tail: list[str] = []
    for sentence in reversed(sentences):
        if tail and count_tokens(" ".join([sentence, *tail])) > max_tokens:
            break
        tail.insert(0, sentence)
    joined = " ".join(tail)
    if count_tokens(joined) > max_tokens:
        joined = " ".join(joined.split()[-int(max_tokens / 1.3) :])
    return joined


def _split_long(text: str, max_tokens: int) -> list[str]:
    pieces: list[str] = []
    current = ""
    for sentence in split_sentences(text):
        candidate = f"{current} {sentence}".strip()
        if current and count_tokens(candidate) > max_tokens:
            pieces.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        pieces.append(current)
    out: list[str] = []
    for piece in pieces:  # a single sentence longer than the limit is cut by words
        words = piece.split()
        step = int(max_tokens / 1.3)
        out.extend(" ".join(words[i : i + step]) for i in range(0, len(words), step))
    return out


def build(units: list[Unit], doc_name: str) -> list[ChunkSpec]:
    specs: list[ChunkSpec] = []
    sections: list[tuple[tuple[str, ...], list[int]]] = []
    for i, unit in enumerate(units):
        key = tuple(unit.section)
        if not sections or sections[-1][0] != key:
            sections.append((key, []))
        sections[-1][1].append(i)

    overlap_tokens = int(MAX_TOKENS * OVERLAP)
    for section_key, indexes in sections:
        section = list(section_key)
        section_units = [units[i] for i in indexes]
        section_path = " › ".join(section) or None
        parent_text = "\n\n".join(u.block.text.strip() for u in section_units)
        if count_tokens(parent_text) > PARENT_MAX_TOKENS:
            parent_text = " ".join(parent_text.split()[: int(PARENT_MAX_TOKENS / 1.3)])
        parent_index = len(specs)
        specs.append(
            ChunkSpec(
                kind="section",
                section_path=section_path,
                clause_ref=section_units[0].clause_ref,
                para_ref=section_units[0].para_ref,
                header=_header(doc_name, section, None),
                page_start=min(u.block.page for u in section_units),
                page_end=max(u.block.page for u in section_units),
                text=parent_text,
                token_count=count_tokens(parent_text),
                boxes=[],
                unit_indexes=list(indexes),
            )
        )

        current: list[int] = []
        carry: tuple[int, str] | None = None  # (unit index, tail sentences) repeated at the start of the next chunk

        def flush(
            carry_overlap: bool,
            section: list[str] = section,
            section_path: str | None = section_path,
            parent_index: int = parent_index,
        ) -> None:
            nonlocal current, carry
            body = [i for i in current if units[i].kind != "heading"]
            if not body:
                return
            parts = ([(units[carry[0]], carry[1])] if carry else []) + [
                (units[i], units[i].block.text.strip()) for i in current
            ]
            text = "\n\n".join(t for _, t in parts)
            first = units[body[0]]
            pages = [u.block.page for u, _ in parts]
            for piece in _split_long(text, MAX_TOKENS) if count_tokens(text) > MAX_TOKENS * 1.5 else [text]:
                specs.append(
                    ChunkSpec(
                        kind="text",
                        section_path=section_path,
                        clause_ref=first.clause_ref,
                        para_ref=first.para_ref,
                        header=_header(doc_name, section, first.clause_ref),
                        page_start=min(pages),
                        page_end=max(pages),
                        text=piece,
                        token_count=count_tokens(piece),
                        boxes=_boxes(parts),
                        parent=parent_index,
                        unit_indexes=([carry[0]] if carry else []) + list(current),
                    )
                )
            last = body[-1]
            carry = (last, _tail(units[last].block.text.strip(), overlap_tokens)) if carry_overlap else None
            current = []

        for i in indexes:
            unit = units[i]
            if unit.kind in ("table", "footnote"):
                if any(units[j].kind != "heading" for j in current):
                    flush(carry_overlap=False)
                carry = None
                specs.append(
                    ChunkSpec(
                        kind=unit.kind,
                        section_path=section_path,
                        clause_ref=unit.clause_ref,
                        para_ref=unit.para_ref,
                        header=_header(doc_name, section, unit.clause_ref),
                        page_start=unit.block.page,
                        page_end=unit.block.page,
                        text=unit.block.text.strip(),
                        token_count=count_tokens(unit.block.text),
                        boxes=_boxes([(unit, unit.block.text.strip())]),
                        parent=parent_index,
                        unit_indexes=[i],
                    )
                )
                current = [j for j in current if units[j].kind == "heading"]
                continue
            current_tokens = sum(count_tokens(units[j].block.text) for j in current)
            unit_tokens = count_tokens(unit.block.text)
            new_clause = (
                unit.clause_ref is not None
                and current
                and units[current[-1]].clause_ref is not None
                and unit.clause_ref.split("(")[0] != units[current[-1]].clause_ref.split("(")[0]  # type: ignore[union-attr]
            )
            if current_tokens + unit_tokens > MAX_TOKENS or (current_tokens >= MIN_TOKENS and new_clause):
                flush(carry_overlap=True)
            current.append(i)
        if any(units[j].kind != "heading" for j in current):
            flush(carry_overlap=False)
    return specs
