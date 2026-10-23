"""Deterministic text rules: FTS queries, authorities, placeholders, sentence choice, pinpoints, embeddings."""

import sqlite3

import pytest

from legallens.drafting import authorities, placeholders
from legallens.models.embedder import HashEmbedder
from legallens.search.fts import build_fts_query, clause_refs, content_terms
from legallens.search.pinpoint import pinpoint
from legallens.search.sentences import best_sentence


class TestFtsQuery:
    def test_clause_reference_becomes_a_phrase(self) -> None:
        query = build_fts_query("What does 4.2(b)(iii) say?")
        assert query is not None
        assert '"4 2 b iii"' in query
        assert clause_refs("see 4.2(b)(iii) and 7.1") == ["4.2(b)(iii)", "7.1"]

    def test_stop_words_dropped_and_terms_quoted(self) -> None:
        assert build_fts_query("What is the notice period?") == '"notice" OR "period"'

    def test_quoted_text_kept_as_a_phrase(self) -> None:
        assert build_fts_query('Where is "Effective Date" defined?') == '"effective date" OR "defined"'

    def test_only_stop_words_gives_no_query(self) -> None:
        assert build_fts_query("what is it?") is None

    @pytest.mark.parametrize("hostile", ['NEAR("a" "b")', 'x" OR 1=1 --', "col:value AND -term*", '") DROP TABLE'])
    def test_user_text_cannot_break_match_syntax(self, hostile: str) -> None:
        query = build_fts_query(hostile)
        db = sqlite3.connect(":memory:")
        db.execute("CREATE VIRTUAL TABLE t USING fts5(text, tokenize='porter unicode61')")
        db.execute("INSERT INTO t VALUES ('a b col value term drop table')")
        if query:
            db.execute("SELECT rowid FROM t WHERE t MATCH ?", (query,)).fetchall()

    def test_content_terms(self) -> None:
        assert content_terms("Is the non-compete enforceable in California?") == [
            "non",
            "compete",
            "enforceable",
            "california",
        ]


class TestAuthorities:
    def test_finds_each_kind(self) -> None:
        text = (
            "Under Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008), and 15 U.S.C. § 1692g, "
            "Cal. Civ. Code § 3289, Fed. R. Evid. 408 and 12 C.F.R. § 1006.34 apply."
        )
        found = {(a.kind, a.text) for a in authorities.find(text)}
        assert ("case", "Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008)") in found
        assert ("statute", "15 U.S.C. § 1692g") in found
        assert ("statute", "Cal. Civ. Code § 3289") in found
        assert ("rule", "Fed. R. Evid. 408") in found
        assert ("regulation", "12 C.F.R. § 1006.34") in found

    def test_case_core_is_the_case_name(self) -> None:
        (case,) = authorities.find("See Smith v. Jones, 123 U.S. 456 (1990).")
        assert case.core == "Smith v. Jones"

    def test_contract_section_references_are_not_authority(self) -> None:
        assert authorities.find("Under Section 4.2 of the Agreement and clause 7.1, notice is required.") == []

    def test_wrap_unverified_is_idempotent(self) -> None:
        text = "As held in Smith v. Jones, 123 U.S. 456 (1990), the clause fails."
        (case,) = authorities.find(text)
        once = authorities.wrap_unverified(text, {case.key})
        assert "[UNVERIFIED: Smith v. Jones, 123 U.S. 456 (1990)]" in once
        assert authorities.wrap_unverified(once, {case.key}) == once

    def test_item_id_is_stable(self) -> None:
        (a,) = authorities.find("Smith v. Jones, 123 U.S. 456 (1990)")
        (b,) = authorities.find("Earlier text. Smith  v. Jones, 123 U.S. 456 (1990)")
        assert a.item_id == b.item_id


class TestPlaceholders:
    def test_kinds_and_blocking(self) -> None:
        text = "Dear [SALUTATION]: [PLACEHOLDER: reply] [CITE NEEDED: x] [RULE NEEDED: y] [UNVERIFIED: Z v. Q] [3]"
        found = placeholders.find(text)
        assert [p["kind"] for p in found] == ["placeholder", "placeholder", "cite_needed", "rule_needed", "unverified"]
        assert len(placeholders.blocking(found)) == 4

    def test_clean_text_transforms(self) -> None:
        assert (
            placeholders.strip_citation_markers("Notice is 60 days [1] by mail [12].") == "Notice is 60 days by mail."
        )
        assert placeholders.unwrap_unverified("See [UNVERIFIED: Smith v. Jones].") == "See Smith v. Jones."


class TestSentencesAndPinpoints:
    TEXT = (
        "4.2 Termination for convenience.\n\n(a) Either party may terminate on sixty (60) days' written notice.\n\n"
        "(b) Notice must be delivered by courier or certified mail.\n\n(i) is effective on receipt; and"
    )

    def test_rarer_words_win(self) -> None:
        quote = best_sentence(self.TEXT, ["termination", "notice", "delivered"])
        assert quote.startswith("(b) Notice must be delivered")

    def test_boosted_follow_up_words_win(self) -> None:
        quote = best_sentence(self.TEXT, ["notice", "delivered", "effective"], boost=["effective"])
        assert quote.startswith("(i) is effective on receipt")

    def test_headings_are_never_quoted(self) -> None:
        assert best_sentence("ARTICLE 9 CONFIDENTIALITY\n\n9.1 Each party shall return it.", ["confidentiality"]) == (
            "9.1 Each party shall return it."
        )

    def test_pinpoint_finds_the_paragraph(self) -> None:
        paragraphs = self.TEXT.split("\n\n")
        boxes, offset = [], 0
        for i, para in enumerate(paragraphs):
            boxes.append(
                {
                    "page": 1 + i // 2,
                    "bbox": [0, i, 1, i + 1],
                    "ref": f"r{i}",
                    "start": offset,
                    "end": offset + len(para),
                }
            )
            offset += len(para) + 2
        page, ref, highlight = pinpoint(self.TEXT, boxes, "(b) Notice must be delivered", 1, "4.2")
        assert (page, ref, len(highlight)) == (2, "r2", 1)
        assert pinpoint(self.TEXT, boxes, "not in the text", 1, "4.2") == (1, "4.2", boxes)


class TestHashEmbedder:
    def test_deterministic_unit_vectors(self) -> None:
        embedder = HashEmbedder(64)
        a, b = embedder.embed(["notice to terminate", "notice to terminate"])
        assert a == b
        assert abs(sum(v * v for v in a) - 1.0) < 1e-9

    def test_similar_text_is_closer(self) -> None:
        embedder = HashEmbedder(256)
        q, near, far = embedder.embed(["terminating with notice", "terminate on written notice", "invoice amounts"])
        cosine = lambda x, y: sum(i * j for i, j in zip(x, y, strict=True))  # noqa: E731
        assert cosine(q, near) > cosine(q, far)


def test_sentence_split_keeps_citations_whole() -> None:
    from legallens.search.sentences import split_sentences

    text = (
        "Smith failed to deliver on time. Under Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008), late "
        "performance entitles Acme to damages. Interest accrues under Cal. Civ. Code § 3289."
    )
    assert split_sentences(text) == [
        "Smith failed to deliver on time.",
        "Under Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008), late performance entitles Acme to damages.",
        "Interest accrues under Cal. Civ. Code § 3289.",
    ]


def test_point_by_point_and_export_gate_for_unanswered_claims() -> None:
    """Decision 2 (DEC-47): a claim with no section blocks a clean export unless the lawyer sets it aside."""
    from legallens.drafting import checks

    content = {
        "claims": [{"id": "c1", "text": "Pay now."}, {"id": "c2", "text": "Stop using our marks."}],
        "sections": [{"id": "s1", "content": "We have paid.", "claim_ids": ["c1"]}],
    }
    points = checks.point_by_point(content)
    assert [p["status"] for p in points] == ["addressed", "missing"]
    gate = checks.export_gate("reviewed_adopted", [], [], points)
    assert [b["code"] for b in gate["blockers"]] == ["unanswered_claims"] and not gate["clean_allowed"]
    waived = checks.point_by_point(content, ["c2"])
    assert [p["status"] for p in waived] == ["addressed", "waived"]
    assert checks.export_gate("reviewed_adopted", [], [], waived)["clean_allowed"]


def test_a_slip_opinion_with_no_v_in_its_caption_is_recognised_as_law() -> None:
    """Found on a real document: Mata v. Avianca opens with its title and a '-against-' caption."""
    from legallens.drafting.checks import opening_looks_like_authority

    mata = (
        "OPINION AND ORDER ON SANCTIONS In researching and drafting court submissions, good lawyers appropriately "
        "obtain assistance from junior lawyers. 1 The potential mischief is demonstrated by an innocent mistake. "
        "UNITED STATES DISTRICT COURT SOUTHERN DISTRICT OF NEW YORK ROBERTO MATA, Plaintiff, -against- AVIANCA, "
        "INC., Defendant. CASTEL, U.S.D.J."
    )
    assert opening_looks_like_authority(mata)
    assert not opening_looks_like_authority(
        "MASTER SERVICES AGREEMENT This Master Services Agreement is entered into as of March 1, 2025 between Smith"
    )
    assert not opening_looks_like_authority(
        "WHITFIELD & GRANT LLP 100 Market Street San Francisco September 15, 2026 Dear Sir or Madam: We represent "
        "Acme Corp. Under Acme Corp. v. Beta Transport, 512 F.3d 1201 (9th Cir. 2008), damages follow."
    )


def test_a_court_caption_alone_is_an_opinion_only_with_an_opinion_title() -> None:
    from legallens.drafting.checks import opening_looks_like_authority

    caption = (
        "UNITED STATES DISTRICT COURT SOUTHERN DISTRICT OF NEW YORK ROBERTO MATA, Plaintiff, -against- AVIANCA, INC."
    )
    assert opening_looks_like_authority(caption + "\nOPINION AND ORDER ON SANCTIONS\nCASTEL, U.S.D.J.")
    assert not opening_looks_like_authority(
        caption + "\nCOMPLAINT\nPlaintiff alleges the following. OPINION of counsel."
    )
    assert not opening_looks_like_authority(caption)


def test_pinpoint_places_a_quote_that_runs_across_a_paragraph_break_and_uses_curly_quotes() -> None:
    from legallens.search.pinpoint import locate

    text = (
        "First paragraph on page one.\n\n"
        "But the mother didn't file it until September 27.\n\n"
        "Our court then ordered more."
    )
    first = text.index("But the mother")
    second = text.index("Our court")
    boxes = [
        {"page": 3, "start": 0, "end": first - 2},
        {"page": 4, "start": first, "end": second - 2},
        {"page": 4, "start": second, "end": len(text)},
    ]
    quote = "But the mother didn’t file it until September 27. Our court then ordered more."
    found = locate(text, boxes, quote)
    assert found is not None and found["page"] == 4
