"""Pure text helpers for the local orchestrator: prompt building and checking what the model wrote."""

import re
from dataclasses import dataclass

from legallens.search.fts import content_terms
from legallens.search.hybrid import Hit
from legallens.search.pinpoint import pinpoint
from legallens.search.scope import display_name
from legallens.search.sentences import best_sentence

MARKER = re.compile(r"\[(\d+)\]")
QUOTE = re.compile(r"[“\"]([^”\"]{8,}?)[”\"]")
CHATTER = re.compile(r"^\s*(sure|certainly|of course|here is|here's|rewritten question|the rewritten)\b", re.I)
NUMBER = re.compile(
    r"\b\d[\d,.]*\b|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|"
    r"sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|"
    r"million|billion)\b",
    re.I,
)
PASSAGE_CHARS = 1800
NOT_FOUND = ("not found in your documents", "not found in this document")


# Models swap straight and curly quotes, hyphens and dashes; a literal quote must survive that.
_CANON = str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "\u00a0": " "})
_ELLIPSIS = re.compile(r"\s*(?:\.\.\.|…)\s*")
_LIST_NUMBER = re.compile(r"^\s*(?:[-*]\s*)?\(?\d{1,2}[.)]\s+", re.M)


_LEAD = re.compile(r"^[\s\[\]\d\"“”'‘’*_-]+")


def norm(text: str) -> str:
    return " ".join(text.translate(_CANON).split()).lower()


def quote_in(quote: str, passage: str) -> bool:
    """The quote is literal in the passage; an ellipsis may stand for omitted words between literal parts."""
    have = norm(passage)
    parts = [p for p in _ELLIPSIS.split(norm(quote)) if len(p) >= 4]
    return bool(parts) and all(p in have for p in parts)


def _stem(word: str) -> str:
    return word[:6]


def about_the_passage(claim: str, passage: str) -> bool:
    """False only when a claim of three or more content words shares none of them with the passage it cites:
    the passage is about something else. Paraphrase passes; a wrong-passage citation doesn't."""
    terms = content_terms(QUOTE.sub(" ", claim))
    if len(terms) < 3:
        return True
    have = norm(passage)
    return any(_stem(t.lower()) in have for t in terms)


def numbers_supported(claim: str, passage: str) -> bool:
    """Every number or number word in the claim also appears in the passage it cites.

    A small model's commonest slip is a wrong figure (30 days becomes 60). Quotes catch invented wording; this
    catches invented amounts, periods and counts."""
    have = norm(passage)
    claim = _LIST_NUMBER.sub(" ", claim)
    words = set(re.findall(r"[a-z]+", have))
    digits = {d.replace(",", "").rstrip(".") for d in re.findall(r"\d[\d,.]*", have)}
    for token in NUMBER.findall(claim):
        token = token.lower().rstrip(".,")
        if token[0].isdigit():
            if token.replace(",", "") not in digits:
                return False
        elif token not in words:
            return False
    return True


# ---------------------------------------------------------------- history and rewrite


def format_history(history: list[dict[str, str]], turns: int, chars: int) -> str:
    """The last turns, each cut short, with citation markers removed (the rewriter only needs the subject)."""
    lines = []
    for message in history[-turns:]:
        content = MARKER.sub("", message.get("content", ""))
        content = " ".join(content.split())[:chars]
        if content:
            lines.append(f"{message.get('role', 'user').upper()}: {content}")
    return "\n".join(lines)


def clean_rewrite(output: str, question: str) -> str:
    """The rewriter's output if it looks like one question, otherwise the user's own words."""
    text = " ".join(output.split()).strip().strip("\"'“”")
    if not text or "\n" in output.strip() or CHATTER.match(text):
        return question
    if question.rstrip().endswith("?") and not text.endswith("?"):  # it answered instead of rewriting
        return question
    if len(text) > max(len(question) * 4, 400):
        return question
    return question if norm(text) == norm(question) else text


# ---------------------------------------------------------------- the answer prompt


_TAG = re.compile(r"<\s*(/?)\s*(passage|point)\b", re.I)


def _neutralise(text: str) -> str:
    """Document text can't open or close our delimiters: any spelling of the tags loses its angle bracket."""
    return _TAG.sub(lambda m: f"‹{m.group(1)}{m.group(2)}", text)


def passage_label(hit: Hit) -> str:
    where = f"p. {hit.page_start}" + (f", {hit.para_ref}" if hit.para_ref else "")
    label = f"{display_name(hit.document_name)}, {where}"
    return re.sub(r'["<>]', "", label)  # a filename is user input: it can't close the attribute or the tag


def build_prompt(question: str, hits: list[Hit], *, point: str | None = None) -> str:
    """QUESTION is ours (the lawyer's words or a fixed instruction). Everything from a document, including the
    other side's point being answered, sits inside a delimited block the system prompt calls data."""
    blocks = [
        f'<passage n="{n}" source="{passage_label(hit)}">\n{_neutralise(hit.text[:PASSAGE_CHARS])}\n</passage>'
        for n, hit in enumerate(hits, start=1)
    ]
    quoted = f"POINT:\n<point>\n{_neutralise(point)}\n</point>\n\n" if point is not None else ""
    return f"QUESTION: {question}\n\n{quoted}PASSAGES:\n" + "\n".join(blocks)


# ---------------------------------------------------------------- checking the answer


@dataclass
class Checked:
    text: str  # the answer with markers renumbered 1..k in order of first appearance
    citations: list["Citation"]
    not_found: bool = False
    unsupported_numbers: bool = False  # a number somewhere in the answer is in none of the cited passages


@dataclass
class Citation:
    n: int
    hit: Hit
    quote: str
    verified: bool
    page: int
    para_ref: str | None
    bbox: list | None  # type: ignore[type-arg]


def check_answer(raw: str, hits: list[Hit], question: str, *, also: str = "") -> Checked | None:
    """Verify what the model wrote against the passages it was given (DEC-21).

    Returns None when the answer has no usable citation, so the caller falls back to quoted passages. A marker
    that points at no passage is removed. A quote that is not in the passage it cites is never shown as the
    citation: the passage's own best sentence is, flagged as not verified. `also` is other text the answer may
    take figures from (a draft may repeat the other side's own numbers when it answers their point).
    """
    text = raw.strip()
    # A leading citation marker or quote mark in front of the refusal ("[1] Not found ...") is still a refusal.
    if norm(_LEAD.sub("", text)).startswith(NOT_FOUND):
        return Checked(text="", citations=[], not_found=True)
    # A refusal sentence after a real answer contradicts it; drop that sentence and keep the answer.
    text = "\n".join(
        " ".join(s for s in re.split(r"(?<=[.!?])\s+", line) if not norm(s).startswith(NOT_FOUND))
        for line in text.splitlines()
    ).strip()

    valid = {n for n in map(int, MARKER.findall(text)) if 1 <= n <= len(hits)}
    text = MARKER.sub(lambda m: m.group(0) if int(m.group(1)) in valid else "", text)
    text = re.sub(r"[ \t]+([.,;:])", r"\1", re.sub(r"[ \t]{2,}", " ", text))

    order: list[int] = []
    for n in map(int, MARKER.findall(text)):
        if n not in order:
            order.append(n)
    if not order:
        return None
    renumber = {old: new for new, old in enumerate(order, start=1)}

    # A quote belongs to the marker that follows it, in the same line.
    quotes: dict[int, list[str]] = {}
    claims: dict[int, str] = {}
    previous = 0
    for match in MARKER.finditer(text):
        line_start = text.rfind("\n", 0, match.start()) + 1
        segment = text[max(previous, line_start) : match.start()]
        quotes.setdefault(int(match.group(1)), []).extend(q.strip() for q in QUOTE.findall(segment))
        claims[int(match.group(1))] = claims.get(int(match.group(1)), "") + " " + segment
        previous = match.end()

    terms = content_terms(question)
    citations: list[Citation] = []
    for old in order:
        hit = hits[old - 1]
        stated = quotes.get(old, [])
        claim = claims.get(old, "")
        good = next((q for q in stated if quote_in(q, hit.text)), None)
        # With no usable quote of its own, show the sentence closest to what the model claimed.
        quote = good or best_sentence(hit.text, content_terms(claim) or terms)
        verified = (
            (good is not None or not stated)
            and numbers_supported(claim, f"{hit.text}\n{also}")
            and about_the_passage(claim, hit.text)
        )
        page, para_ref, boxes = pinpoint(hit.text, hit.bbox, quote, hit.page_start, hit.para_ref)
        citations.append(Citation(renumber[old], hit, quote, verified, page, para_ref, boxes))

    # Uncited sentences (and text after the last marker) are checked for figures against every cited passage.
    cited_text = "\n".join([*(hits[old - 1].text for old in order), also])
    unsupported = not numbers_supported(MARKER.sub(" ", text), cited_text)

    text = MARKER.sub(lambda m: f"[{renumber[int(m.group(1))]}]", text)
    text = re.sub(r"(\[\d+\])(?:\s*\1)+", r"\1", text)  # "[1] [1]" -> "[1]"
    return Checked(text=text, citations=citations, unsupported_numbers=unsupported)
