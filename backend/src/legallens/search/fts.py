"""FTS5 query building. User text never reaches MATCH unquoted, so it can't break or steer the query syntax.

Clause references become phrases: "4.2(b)(iii)" → "4 2 b iii", which is exactly how the unicode61 tokenizer
indexed them. Quoted text and defined terms become phrases too. Everything else is OR'ed word by word, and BM25
ranks chunks that match more of the words higher.
"""

import re

STOPWORDS = frozenset(
    """a about above after again against all am an and any are as at be because been before being below between
    both but by can could did do does doing down during each few for from further had has have having he her
    here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only
    or other our ours out over own same she should so some such than that the their them then there these they
    this those through to too under until up very was we were what when where which while who whom why will
    with would you your yours tell show give find say says said please per vs""".split()
)

_CLAUSE = re.compile(
    r"(?<![\w.])(?:\d+(?:\.\d+)+(?:\s*\([a-z0-9]{1,5}\))*|\d+\s*\([a-z0-9]{1,5}\)(?:\s*\([a-z0-9]{1,5}\))*)",
    re.IGNORECASE,
)
_QUOTED = re.compile(r"\"([^\"]{2,120})\"|“([^”]{2,120})”")
_WORD = re.compile(r"[A-Za-z0-9]+")


def _phrase(text: str) -> str | None:
    tokens = [t.lower() for t in _WORD.findall(text)]
    return '"' + " ".join(tokens) + '"' if tokens else None


def clause_refs(text: str) -> list[str]:
    return [m.group(0) for m in _CLAUSE.finditer(text)]


def content_terms(text: str) -> list[str]:
    """The words that matter for matching: lower-case, no stop words, no single characters."""
    seen: dict[str, None] = {}
    for word in _WORD.findall(text.lower()):
        if word not in STOPWORDS and (len(word) > 1 or word.isdigit()):
            seen.setdefault(word, None)
    return list(seen)


def build_fts_query(text: str) -> str | None:
    phrases: list[str] = []
    remainder = text
    for match in _QUOTED.finditer(text):
        phrase = _phrase(match.group(1) or match.group(2))
        if phrase:
            phrases.append(phrase)
    remainder = _QUOTED.sub(" ", remainder)
    for ref in clause_refs(remainder):
        phrase = _phrase(ref)
        if phrase:
            phrases.append(phrase)
    remainder = _CLAUSE.sub(" ", remainder)
    words = [f'"{w}"' for w in content_terms(remainder)]
    terms = list(dict.fromkeys(phrases + words))
    return " OR ".join(terms) if terms else None
