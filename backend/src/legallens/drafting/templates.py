"""Draft layouts and the stub drafter (DEC-43 to DEC-46).

Claim extraction, the addressee rule and the section layouts are real and reusable. The wording is the stub's:
it quotes the incoming document and leaves `[PLACEHOLDER: …]` and `[CITE NEEDED: …]` where the LangChain drafter
will write, so a stub draft can never be exported clean by accident (DEC-50).
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from legallens.search.pinpoint import pinpoint
from legallens.search.scope import display_name
from legallens.search.sentences import split_sentences

_ENUMERATED = re.compile(r"^\s*(?:\(?\d{1,2}[.)]|\([a-z]\)|first|second|third|fourth|fifth|finally)[,:\s]", re.I)
_CLAIM_WORDS = re.compile(
    r"\b(demand|claim|breach\w*|fail\w*|owe[sd]?|must|require[sd]?|violat\w*|damages|pay(ment)?|refund|"
    r"cease|deadline|liab\w*|withh[eo]ld\w*|terminat\w*|compl(y|iance)|suit|sue|litigation|interest)\b",
    re.I,
)
MAX_CLAIMS = 8

Chunk = dict[str, Any]  # {chunk_id, document_id, document_name, text, page, para_ref, bbox, seq}
FindFacts = Callable[[str], list[Chunk]]


@dataclass(frozen=True)
class Response:
    """A model-written paragraph answering one point. `text` cites its sources as [1], [2]... in order of first
    use; `uses[i]` is (index into the facts that were offered, the exact quote) for marker i + 1."""

    text: str
    uses: list[tuple[int, str]]


Respond = Callable[[str, list[Chunk]], Response | None]


def _citation(n: int, chunk: Chunk, quote: str) -> dict[str, Any]:
    page, para_ref, boxes = pinpoint(
        chunk["text"], chunk.get("bbox") or [], quote, chunk["page"], chunk.get("para_ref")
    )
    return {
        "n": n,
        "chunk_id": chunk["chunk_id"],
        "document_id": chunk["document_id"],
        "document_name": chunk["document_name"],
        "page": page,
        "para_ref": para_ref,
        "quote": quote,
        "bbox": boxes,
    }


def extract_claims(chunks: list[Chunk]) -> list[dict[str, Any]]:
    """Every point the incoming document makes (DEC-47), in the order it makes them: numbered demands as whole
    paragraphs, plus each other sentence that demands, alleges or threatens. Line breaks from OCR or PDF layout
    are joined first, so a claim is never cut mid-sentence."""
    found: list[tuple[Chunk, str]] = []
    for chunk in chunks:
        for paragraph in re.split(r"\n\s*\n", chunk["text"]):
            flat = " ".join(paragraph.split())
            if not flat:
                continue
            if _ENUMERATED.match(flat) and len(flat) > 25:
                found.append((chunk, flat))
                continue
            for sentence in split_sentences(flat):
                if 30 <= len(sentence) <= 600 and _CLAIM_WORDS.search(sentence):
                    found.append((chunk, sentence))
    seen: set[str] = set()
    claims: list[dict[str, Any]] = []
    for chunk, text in found:
        key = " ".join(text.lower().split())[:120]
        if key in seen:
            continue
        seen.add(key)
        quote = text[:400]
        claims.append({"id": f"c{len(claims) + 1}", "text": quote, "source": _citation(0, chunk, quote)})
        if len(claims) >= MAX_CLAIMS:
            break
    return claims


def addressee_for(profile: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    """Model Rule 4.2: write to the other side's lawyer if they have one. Rule 4.3: if not, remind the lawyer not
    to give legal advice to an unrepresented person (DEC-46). Returns (addressee, rule_4_3_reminder)."""
    opposing = [p for p in profile.get("parties", []) if p.get("role") == "opposing"]
    if not opposing:
        return None, False
    party = opposing[0]
    counsel = party.get("counsel")
    if party.get("represented") and counsel:
        return {
            "name": counsel["name"],
            "firm": counsel.get("firm"),
            "address": counsel.get("address"),
            "email": counsel.get("email"),
            "rule": "4.2",
        }, False
    return {"name": party["name"], "firm": None, "address": None, "email": None, "rule": "4.3"}, True


def _renumber(text: str, mapping: dict[int, int]) -> str:
    """A response's local [1], [2]... become the letter's running citation numbers."""

    def swap(match: re.Match[str]) -> str:
        n = int(match.group(1))
        return f"[{mapping.get(n, n)}]"

    return re.sub(r"\[(\d+)\]", swap, text)


def _short(text: str, words: int = 8) -> str:
    parts = re.sub(r"^\s*(?:\(?\d{1,2}[.)]|\([a-z]\))\s*", "", text).split()
    return " ".join(parts[:words]).rstrip(",.;:") + ("…" if len(parts) > words else "")


def response_letter(
    *,
    matter: dict[str, Any],
    incoming_name: str,
    incoming_chunks: list[Chunk],
    find_facts: FindFacts,
    addressee: dict[str, Any] | None,
    author: str = "[ATTORNEY NAME]",
    respond: Respond | None = None,
) -> dict[str, Any]:
    claims = extract_claims(incoming_chunks)
    n = 0

    def next_n() -> int:
        nonlocal n
        n += 1
        return n

    sections: list[dict[str, Any]] = []
    if addressee:
        lines = [addressee["name"], addressee.get("firm") or "", addressee.get("address") or ""]
        address_block = "\n".join(line for line in lines if line)
    else:
        address_block = "[ADDRESSEE NAME]\n[ADDRESS]"
    sections.append(
        {"id": "s1", "kind": "addressee", "heading": "Addressee", "show_heading": False, "content": address_block}
    )
    sections.append(
        {"id": "s2", "kind": "re", "heading": "Re", "show_heading": False, "content": f"Re: {matter['name']}"}
    )
    opening = incoming_chunks[0] if incoming_chunks else None
    intro_citations = []
    intro = (
        f"Dear {addressee['name'] if addressee else '[SALUTATION]'}:\n\n"
        f"We represent {matter['client_name']} in connection with {matter['name']}. "
        f"We write in response to {display_name(incoming_name)}, dated [LETTER DATE]"
    )
    if opening:
        number = next_n()
        intro += f" [{number}]"
        intro_citations.append(_citation(number, opening, " ".join(opening["text"].split())[:200]))
    intro += "."
    sections.append(
        {
            "id": "s3",
            "kind": "intro",
            "heading": "Introduction",
            "show_heading": False,
            "content": intro,
            "citations": intro_citations,
        }
    )

    for index, claim in enumerate(claims, start=1):
        citations = []
        number = next_n()
        source = dict(claim["source"])
        source["n"] = number
        citations.append(source)
        body = f"Your letter states: “{claim['text']}” [{number}]\n\n"
        offered = [f for f in find_facts(claim["text"]) if f["document_id"] != source["document_id"]]
        written = respond(claim["text"], offered[:3]) if respond and offered else None
        if written:
            mapping: dict[int, int] = {}
            for local, (fact_index, quote) in enumerate(written.uses, start=1):
                mapping[local] = next_n()
                citations.append(_citation(mapping[local], offered[fact_index], quote))
            body += _renumber(written.text, mapping)
        else:
            body += f"[PLACEHOLDER: our response to point {index}]"
            for fact in offered[:1]:
                fact_number = next_n()
                quote = " ".join(fact["text"].split())[:280]
                citations.append(_citation(fact_number, fact, quote))
                body += f"\n\nThe documents show: “{quote}” [{fact_number}]"
        body += f"\n\n[CITE NEEDED: authority supporting our position on point {index}]"
        sections.append(
            {
                "id": f"s{len(sections) + 1}",
                "kind": "point",
                "heading": f"Point {index}: {_short(claim['text'])}",
                "show_heading": True,
                "content": body,
                "citations": citations,
                "claim_ids": [claim["id"]],
            }
        )

    sections.append(
        {
            "id": f"s{len(sections) + 1}",
            "kind": "closing",
            "heading": "Closing",
            "show_heading": False,
            "content": (
                "Please direct any further correspondence about this matter to the undersigned.\n\n"
                f"Sincerely,\n\n{author}"
            ),
        }
    )
    for section in sections:
        section.setdefault("citations", [])
        section.setdefault("claim_ids", [])
        section["origin"] = "ai"
    return {"sections": sections, "claims": claims}


def memo(
    *,
    matter: dict[str, Any],
    incoming_name: str,
    incoming_chunks: list[Chunk],
    find_facts: FindFacts,
    instructions: str,
    author: str = "[ATTORNEY NAME]",
    narrate: Respond | None = None,
) -> dict[str, Any]:
    """DEC-45 structure. Law comes only from uploaded authority, so every Rule step starts as [RULE NEEDED: …].

    The Statement of Facts is written by the model when `narrate` is given and its paragraph checks out (every
    citation literal, every figure in a passage, no authority); otherwise the first passages are quoted."""
    pool = incoming_chunks[:6]
    written = narrate("Write the Statement of Facts.", pool) if narrate and pool else None
    if written:
        mapping: dict[int, int] = {}
        citations = []
        for local, (fact_index, quote) in enumerate(written.uses, start=1):
            mapping[local] = local
            citations.append(_citation(local, pool[fact_index], quote))
        statement = _renumber(written.text, mapping)
    else:
        facts = incoming_chunks[:3]
        citations = [_citation(i, c, " ".join(c["text"].split())[:280]) for i, c in enumerate(facts, start=1)]
        statement = "\n\n".join(f"“{c['quote']}” [{c['n']}]" for c in citations) or "[PLACEHOLDER: statement of facts]"
    sections = [
        {
            "id": "s1",
            "kind": "memo_header",
            "heading": "Memorandum",
            "show_heading": True,
            "content": f"To: [RECIPIENT]\nFrom: {author}\nDate: [DATE]\nRe: {matter['name']}",
        },
        {
            "id": "s2",
            "kind": "question",
            "heading": "Question Presented",
            "show_heading": True,
            "content": "[PLACEHOLDER: question presented]",
        },
        {
            "id": "s3",
            "kind": "brief_answer",
            "heading": "Brief Answer",
            "show_heading": True,
            "content": "This question can't be answered from the matter's documents until the governing authority is "
            "uploaded. [RULE NEEDED: upload or insert authority for the main issue]",
        },
        {
            "id": "s4",
            "kind": "facts",
            "heading": "Statement of Facts",
            "show_heading": True,
            "content": statement,
            "citations": citations,
        },
        {
            "id": "s5",
            "kind": "discussion",
            "heading": "Discussion",
            "show_heading": True,
            "content": "Issue 1. [PLACEHOLDER: issue]\n\n"
            "Rule. [RULE NEEDED: upload or insert authority for issue 1]\n\n"
            "Application. [PLACEHOLDER: apply the rule to the facts above]\n\nConclusion. [PLACEHOLDER: conclusion]",
        },
        {
            "id": "s6",
            "kind": "conclusion",
            "heading": "Conclusion",
            "show_heading": True,
            "content": "[PLACEHOLDER: conclusion]",
        },
    ]
    for section in sections:
        section.setdefault("citations", [])
        section.setdefault("claim_ids", [])
        section["origin"] = "ai"
    return {"sections": sections, "claims": []}


def claim_response(claim: dict[str, Any], sections: list[dict[str, Any]]) -> dict[str, Any]:
    """A new section answering one claim the draft leaves unanswered (DEC-47). Like the other points it quotes the
    claim and leaves the reply and its authority for the lawyer, so it can't be exported clean by accident."""
    numbers = [c.get("n", 0) for s in sections for c in s.get("citations", [])]
    number = max(numbers, default=0) + 1
    taken = {s["id"] for s in sections}
    index = len(sections) + 1
    while f"s{index}" in taken:
        index += 1
    source = dict(claim["source"])
    source["n"] = number
    return {
        "id": f"s{index}",
        "kind": "point",
        "heading": f"Point: {_short(claim['text'])}",
        "show_heading": True,
        "content": (
            f"Your letter states: “{claim['text']}” [{number}]\n\n[PLACEHOLDER: our response to this point]"
            "\n\n[CITE NEEDED: authority supporting our position on this point]"
        ),
        "citations": [source],
        "claim_ids": [claim["id"]],
        "origin": "ai",
    }


def stub_rewrite(section: dict[str, Any], instruction: str) -> str:
    """The stub can't rewrite prose. It keeps the text and records the instruction as a placeholder, which also
    keeps a clean export blocked until the lawyer has dealt with it."""
    note = " ".join(instruction.split())[:300]
    return f"{section['content'].rstrip()}\n\n[PLACEHOLDER: revise this section: {note}]"


def pick_section(sections: list[dict[str, Any]], instruction: str) -> dict[str, Any]:
    """The section an instruction is about: "paragraph 3" / "point 2" / "section 4", or a heading it names, else the
    last body section."""
    text = instruction.lower()
    match = re.search(r"\b(paragraph|para|point|section)\s+(\d{1,2})\b", text)
    if match:
        number = int(match.group(2))
        if match.group(1) == "point":
            points = [s for s in sections if s.get("kind") == "point"]
            if 1 <= number <= len(points):
                return points[number - 1]
        elif 1 <= number <= len(sections):
            return sections[number - 1]
    for section in sections:
        words = [w for w in re.findall(r"[a-z]{4,}", section.get("heading", "").lower()) if w not in {"point"}]
        if words and sum(w in text for w in words) >= 2:
            return section
    body = [s for s in sections if s.get("kind") not in ("addressee", "re", "closing", "memo_header")]
    return (body or sections)[-1]
