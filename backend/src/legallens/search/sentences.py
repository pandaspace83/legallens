"""Picking the sentence to quote from a passage: the one that best matches the question's words, with rarer
words counting more (a tiny TF-IDF over the passage's own sentences). Headings are never quoted."""

import re

_PARAGRAPH = re.compile(r"\n\s*\n")
_BOUNDARY = re.compile(r"(?<=[.;!?])\s+(?=[A-Z(\"“0-9$])")
# Abbreviations common in legal text. A period after one of these doesn't end the sentence, so
# "Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008)" stays in one piece.
_ABBREVIATIONS = frozenset(
    """v vs corp inc co ltd llc llp lp no nos cir ct app supp civ crim evid proc fed r p u.s u.s.c c.f.r cal
    stat ann code sec art cl para pp mr mrs ms dr st ave blvd rd jr sr e.g i.e etc al cf id ibid ex exh dept
    gov govt assn bros mfg intl natl jan feb mar apr jun jul aug sep sept oct nov dec""".split()
)


def split_sentences(text: str) -> list[str]:
    pieces = [p for p in _BOUNDARY.split(text) if p.strip()]
    out: list[str] = []
    for piece in pieces:
        if out:
            last_word = out[-1].rstrip().rsplit(" ", 1)[-1].lower().rstrip(".").lstrip("(")
            if last_word in _ABBREVIATIONS or (len(last_word) == 1 and last_word.isalpha()):
                out[-1] = f"{out[-1]} {piece.strip()}"
                continue
        out.append(piece.strip())
    return out


def _stem(term: str) -> str:
    return term[:6] if len(term) > 6 else term


_SMALL_WORDS = {"of", "and", "the", "for", "to", "in", "on", "a", "an", "or", "by", "with"}


def _is_heading(text: str) -> bool:
    """ALL CAPS, or a short Title Case line without closing punctuation ("4.2 Termination for Convenience")."""
    if len(text) > 80 or text.rstrip().endswith((".", ";", ":", ",")):
        return False
    letters = [c for c in text if c.isalpha()]
    if letters and all(c.isupper() for c in letters):
        return True
    words = [w for w in text.split() if w[0].isalpha()]
    return 0 < len(words) <= 8 and all(w[0].isupper() or w.lower() in _SMALL_WORDS for w in words)


def sentences(text: str) -> list[str]:
    out = []
    for paragraph in _PARAGRAPH.split(text):
        flat = " ".join(paragraph.split())
        if not flat or _is_heading(flat):
            continue
        out.extend(split_sentences(flat))
    return out or [" ".join(text.split())]


def best_sentence(text: str, terms: list[str], limit: int = 320, boost: list[str] | None = None) -> str:
    """boost: a follow-up's own words. When some sentence contains one of them, only those sentences are candidates:
    the earlier question's words help find the passage, but the quote must answer what was just asked."""
    candidates = sentences(text)
    boosted = {_stem(t.lower()) for t in boost or []}
    focused = [c for c in candidates if any(b in c.lower() for b in boosted)]
    candidates = focused or candidates
    stems = [_stem(t.lower()) for t in terms]
    lowered = [c.lower() for c in candidates]
    weights = {s: (2.0 if s in boosted else 1.0) / max(1, sum(s in c for c in lowered)) for s in stems}

    def score(i: int) -> tuple[float, int]:
        return sum(w for s, w in weights.items() if s in lowered[i]), -abs(len(candidates[i]) - 160)

    best = candidates[max(range(len(candidates)), key=score)]
    if len(best) <= limit:
        return best
    return best[:limit].rsplit(" ", 1)[0]
