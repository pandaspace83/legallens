"""Legal structure, chunking, coverage and file-type sniffing."""

from pathlib import Path

from legallens.ingestion import chunker, coverage, legal
from legallens.ingestion.convert import Block, PageInfo
from legallens.ingestion.convert.text import convert_text
from legallens.ingestion.sniff import sniff

PAGES = [PageInfo(1, 612, 792), PageInfo(2, 612, 792)]


def _blocks(*items: tuple[str, str], page: int = 1) -> list[Block]:
    out, y = [], 100.0
    for kind, text in items:
        out.append(Block(page, kind, text, [72, y, 540, y + 20]))
        y += 30
    return out


class TestLegalStructure:
    def test_clause_references_nest(self) -> None:
        blocks = _blocks(
            ("heading", "ARTICLE 4 TERMINATION"),
            ("text", "4.2 Either party may terminate this Agreement as follows."),
            ("text", "(a) on notice;"),
            ("text", "(b) for breach, where:"),
            ("text", "(i) the breach is material; and"),
            ("text", "(ii) it is not cured."),
            ("text", "(c) on insolvency."),
            ("text", "4.3 Termination does not affect accrued rights."),
        )
        refs = [u.clause_ref for u in legal.analyse(blocks, PAGES).units]
        assert refs == ["4", "4.2", "4.2(a)", "4.2(b)", "4.2(b)(i)", "4.2(b)(ii)", "4.2(c)", "4.3"]

    def test_letter_i_after_h_is_alphabetic(self) -> None:
        blocks = _blocks(("text", "5.1 Items:"), ("text", "(h) eighth;"), ("text", "(i) ninth;"))
        assert [u.clause_ref for u in legal.analyse(blocks, PAGES).units][-1] == "5.1(i)"

    def test_numbered_paragraph_closes_previous_numbered_heading(self) -> None:
        blocks = _blocks(
            ("heading", "ARTICLE 4 TERMINATION"),
            ("heading", "4.2 Termination for convenience"),
            ("text", "(a) Either party may terminate on notice."),
            ("text", "4.3 Termination for breach. Either party may terminate if the other party breaches."),
        )
        units = legal.analyse(blocks, PAGES).units
        assert units[2].section == ["ARTICLE 4 TERMINATION", "4.2 Termination for convenience"]
        assert units[3].section == ["ARTICLE 4 TERMINATION"]

    def test_defined_terms(self) -> None:
        blocks = _blocks(
            ("text", 'This agreement (the "Agreement") is between Smith ("Smith") and Acme.'),
            ("text", '1.1 "Effective Date" means March 1, 2025.'),
        )
        terms = [t for t, _ in legal.analyse(blocks, PAGES).defined_terms]
        assert terms == ["Agreement", "Smith", "Effective Date"]

    def test_running_footers_and_bates_become_metadata(self) -> None:
        blocks = [
            Block(1, "text", "Body text on page one that is long enough to matter.", [72, 100, 540, 120]),
            Block(1, "text", "Smith MSA v3 · Confidential", [72, 760, 300, 770]),
            Block(1, "text", "SMITH000121", [480, 770, 540, 780]),
            Block(2, "text", "Body text on page two, also long enough to matter here.", [72, 100, 540, 120]),
            Block(2, "text", "Smith MSA v3 · Confidential", [72, 760, 300, 770]),
            Block(2, "text", "SMITH000122", [480, 770, 540, 780]),
        ]
        structure = legal.analyse(blocks, PAGES)
        assert [u.block.text[:9] for u in structure.units] == ["Body text", "Body text"]
        assert [b["value"] for b in structure.bates] == ["SMITH000121", "SMITH000122"]


class TestChunker:
    def test_tables_are_never_split_and_headers_carry_the_path(self) -> None:
        table = "| a | b |\n|---|---|\n" + "\n".join(f"| row {i} | value {i} |" for i in range(200))
        blocks = _blocks(("heading", "ARTICLE 2 FEES"), ("text", "2.1 Fees are due monthly."), ("table", table))
        specs = chunker.build(legal.analyse(blocks, PAGES).units, "Smith MSA v3")
        tables = [s for s in specs if s.kind == "table"]
        assert len(tables) == 1 and tables[0].text == table
        assert specs[0].kind == "section"
        text_chunk = next(s for s in specs if s.kind == "text")
        assert text_chunk.header == "Smith MSA v3 › ARTICLE 2 FEES › 2.1"
        assert text_chunk.parent == 0

    def test_long_sections_split_with_overlap(self) -> None:
        sentence = "The supplier shall deliver the goods on time and in good condition at the agreed place. "
        blocks = _blocks(("heading", "ARTICLE 3 DELIVERY"), *[("text", f"3.{i} " + sentence * 6) for i in range(1, 15)])
        specs = [s for s in chunker.build(legal.analyse(blocks, PAGES).units, "Doc") if s.kind == "text"]
        assert len(specs) > 2
        assert all(s.token_count <= chunker.MAX_TOKENS * 1.5 for s in specs)
        shared = set(specs[0].unit_indexes) & set(specs[1].unit_indexes)
        assert shared, "consecutive chunks should overlap"

    def test_paragraph_boxes_record_offsets(self) -> None:
        blocks = _blocks(("text", "1.1 First paragraph."), ("text", "1.2 Second paragraph."))
        (spec,) = [s for s in chunker.build(legal.analyse(blocks, PAGES).units, "Doc") if s.kind == "text"]
        second = spec.boxes[1]
        assert spec.text[second["start"] : second["end"]] == "1.2 Second paragraph."
        assert second["ref"] == "1.2"


def test_coverage_report_wording() -> None:
    pages = [PageInfo(1, 612, 792), PageInfo(2, 612, 792, False, True, 0.72), PageInfo(3, 612, 792, False, True, None)]
    units = legal.analyse(
        _blocks(("text", "Readable text on page one.")) + _blocks(("text", "OCR text."), page=2), pages
    ).units
    report = coverage.build(pages, units, 0.80)
    assert report["text"] == "2 of 3 pages read; p. 3 unreadable; OCR on pp. 2 and 3; low OCR confidence on p. 2"
    assert report["low_confidence_pages"] == [{"page": 2, "ocr_conf": 0.72}]


def test_text_converter_pages_and_headings() -> None:
    converted = convert_text("RESIDENTIAL LEASE\n\n1. PREMISES\n\n" + ("Long paragraph text. " * 40 + "\n\n") * 10)
    assert converted.blocks[0].kind == "heading"
    assert len(converted.pages) > 1


def test_sniff_by_bytes_not_extension(samples_dir: Path, tmp_path: Path) -> None:
    kinds = {name: sniff(samples_dir / name).kind for name in sorted(p.name for p in samples_dir.iterdir())}  # type: ignore[union-attr]
    assert kinds == {
        "acme_demand_letter_scanned.pdf": "pdf",
        "acme_redline_other_side.docx": "docx",
        "email_from_acme_counsel.eml": "eml",
        "exhibit_b_invoices.pdf": "pdf",
        "rivera_lease.txt": "txt",
        "smith_msa_v3.pdf": "pdf",
    }
    fake = tmp_path / "invoice.pdf"
    fake.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    assert sniff(fake) is None
    zipped = tmp_path / "archive.docx"
    import zipfile

    with zipfile.ZipFile(zipped, "w") as zf:
        zf.writestr("readme.txt", "not a word file")
    assert sniff(zipped) is None


def test_address_lines_are_not_numbered_headings() -> None:
    blocks = _blocks(
        ("text", "WHITFIELD & GRANT LLP"),
        ("text", "100 Market Street, Suite 400, San Francisco, CA 94105"),
        ("text", "We represent Acme Corp in connection with the Agreement."),
    )
    units = legal.analyse(blocks, PAGES).units
    assert units[-1].clause_ref is None and units[-1].para_ref.startswith("¶")
