"""Finds legal authority in draft text: cases, statutes, court rules and regulations (DEC-48, DEC-49).

Pattern-based and deterministic, so the citation checklist never depends on a model's judgement. It catches
the common US forms (e.g. "Smith v. Jones, 123 F.3d 456 (9th Cir. 1999)", "15 U.S.C. § 1692g",
"Cal. Civ. Code § 1671", "Fed. R. Evid. 408", "12 C.F.R. § 1006.34"). It errs toward flagging: a false
positive costs one acknowledgement click, a miss could put an invented case in a letter (RISK-01).
"""

import hashlib
import re
from dataclasses import dataclass

from legallens.drafting.placeholders import UNVERIFIED_RE

_NAME = r"[A-Z][\w.&'\-]*(?:\s+(?:of|the|and|&|ex|rel\.|[A-Z][\w.&'\-]*)){0,5}"
_REPORTER = (
    r"(?:U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.(?:\s?2d)?|F\.\s?Supp\.(?:\s?[23]d)?|F\.\s?App'x|F\.(?:\s?(?:2d|3d|4th))?|"
    r"Cal\.\s?Rptr\.(?:\s?[23]d)?|Cal\.(?:\s?App\.)?(?:\s?(?:2d|3d|4th|5th))?|N\.E\.(?:\s?[23]d)?|N\.W\.(?:\s?2d)?|"
    r"S\.E\.(?:\s?2d)?|S\.W\.(?:\s?[23]d)?|So\.(?:\s?[23]d)?|P\.(?:\s?[23]d)?|A\.(?:\s?[23]d)?|"
    r"N\.Y\.S\.(?:\s?[23]d)?|N\.Y\.(?:\s?[23]d)?|Ill\.(?:\s?App\.)?(?:\s?[23]d)?|WL)"
)
CASE_RE = re.compile(
    rf"\b(?P<name>{_NAME}\s+v\.\s+{_NAME})"
    rf"(?:,\s(?P<vol>\d{{1,4}})\s(?P<rep>{_REPORTER})\s(?P<page>\d{{1,6}})(?:,\s\d{{1,6}})?(?:\s\([^)]{{0,40}}\d{{4}}\))?)?"
)
STATUTE_RE = re.compile(
    r"\b\d+\s+U\.\s?S\.\s?C\.?\s*§{1,2}\s*[\w.\-()]+"
    r"|\b(?:[A-Z][a-z]+\.?\s(?:&\s)?){1,4}(?:Code|Stat\.|Laws|Gen\.\sLaws)(?:\sAnn\.)?\s*§{1,2}\s*[\w.\-():]+"
)
RULE_RE = re.compile(
    r"\bFed\.\s?R\.\s?(?:Civ|Crim|Evid|App|Bankr)\.(?:\s?P\.)?\s?\d+(?:\.\d+)?(?:\([a-z0-9]+\))*"
    r"|\bFederal Rules? of (?:Civil|Criminal|Appellate|Bankruptcy) Procedure\s\d+(?:\([a-z0-9]+\))*"
    r"|\bFederal Rules? of Evidence\s\d+"
    r"|\b(?:FRE|FRCP)\s\d+(?:\([a-z0-9]+\))*"
)
REGULATION_RE = re.compile(r"\b\d+\s+C\.\s?F\.\s?R\.\s*§{1,2}\s*[\w.\-()]+")

# Citation signals and sentence openers that the case-name pattern would otherwise swallow.
_SIGNALS = re.compile(
    r"^(?:(?:See|also|Under|In|As|held|in|Per|Cf\.|But|Compare|Accord|Following|Citing|Pursuant|to|E\.g\.,?|"
    r"The|Our|Their|Your|And|Or|Because|Since|Unlike|Like|Contra)\s+)+"
)

_SENTENCE_STARTERS = frozenset(
    "We I You He She It They This That These Those The A An Our Your Their In On At As If Please Any All No".split()
)


def _trim_at_sentence(core: str) -> str:
    """ "Smith v. Acme Corp. We write…" → "Smith v. Acme Corp.": a name ends where a new sentence starts."""
    words = core.split()
    for i, word in enumerate(words[:-1]):
        if word.endswith(".") and words[i + 1] in _SENTENCE_STARTERS and i >= 2:
            return " ".join(words[: i + 1])
    return core


_PATTERNS = (("case", CASE_RE), ("statute", STATUTE_RE), ("rule", RULE_RE), ("regulation", REGULATION_RE))


@dataclass(frozen=True)
class Authority:
    text: str
    kind: str
    start: int
    end: int
    core: str  # what to search the documents for: the case name, or the whole cite

    @property
    def key(self) -> str:
        return normalise(self.text)

    @property
    def item_id(self) -> str:
        """Stable across versions while the cite is unchanged, so an acknowledgement survives other edits."""
        return "auth_" + hashlib.sha1(self.key.encode()).hexdigest()[:12]


def normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9§]+", " ", text.lower()).strip()


def find(text: str) -> list[Authority]:
    spans: list[Authority] = []
    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            value = match.group(0).strip().rstrip(".,;")
            start = match.start()
            core = match.group("name") if kind == "case" else value
            if kind == "case":
                lead = _SIGNALS.match(value)
                if lead:
                    value, core, start = value[lead.end() :], core[lead.end() :], start + lead.end()
                if match.group("rep") is None:
                    core = _trim_at_sentence(core)
                    value = core.rstrip(".,;") if core.endswith(("Corp.", "Inc.", "Co.", "Ltd.")) else core
                if " v. " not in core or len(value) < 8:
                    continue
            if any(start < a.end and a.start < start + len(value) for a in spans):
                continue  # overlaps an authority already found (e.g. a rule inside a case cite)
            spans.append(Authority(value, kind, start, start + len(value), core))
    return sorted(spans, key=lambda a: a.start)


def _inside_unverified(text: str, start: int, end: int) -> bool:
    return any(m.start() <= start and end <= m.end() for m in UNVERIFIED_RE.finditer(text))


def wrap_unverified(text: str, keys: set[str]) -> str:
    """Replaces each listed authority with `[UNVERIFIED: <as written>]` unless it is already wrapped (DEC-48)."""
    out, last = [], 0
    for authority in find(text):
        if authority.key not in keys or _inside_unverified(text, authority.start, authority.end):
            continue
        out.append(text[last : authority.start])
        out.append(f"[UNVERIFIED: {authority.text}]")
        last = authority.end
    out.append(text[last:])
    return "".join(out)
