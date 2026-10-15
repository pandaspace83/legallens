"""Builds the UAT workbook from test-evidence/results.json and the screenshots next to it.

    python scripts/build_test_report.py [test-evidence-dir] [output.xlsx]

Sheets: Summary (formulas over the Test Cases sheet), Test Cases, Checks, Backend evidence, Evidence (screenshots).
"""

import json
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "test-evidence"
OUTPUT = Path(sys.argv[2]) if len(sys.argv) > 2 else EVIDENCE / "LegalLens_E2E_Test_Results.xlsx"

FONT = "Arial"
HEAD = PatternFill("solid", fgColor="1F3A5F")
PASS_FILL = PatternFill("solid", fgColor="D9F2D9")
FAIL_FILL = PatternFill("solid", fgColor="F8D0D0")
BAND = PatternFill("solid", fgColor="F3F6FA")
THIN = Side(style="thin", color="C8D0DC")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")


def head(ws, row, values):
    for col, value in enumerate(values, start=1):
        cell = ws.cell(row=row, column=col, value=value)
        cell.font = Font(name=FONT, bold=True, color="FFFFFF")
        cell.fill = HEAD
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        cell.border = BORDER


def body(cell, bold=False):
    cell.font = Font(name=FONT, size=10, bold=bold)
    cell.alignment = WRAP
    cell.border = BORDER


def widths(ws, values):
    for i, w in enumerate(values, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def thumb(path: Path, max_width: int = 760) -> Path | None:
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover
        return path
    out = path.with_name(f"{path.stem}.thumb.png")
    with Image.open(path) as im:
        ratio = min(1.0, max_width / im.width)
        im.resize((int(im.width * ratio), int(im.height * ratio))).save(out)
    return out


def main() -> None:
    results = json.loads((EVIDENCE / "results.json").read_text())
    results.sort(key=lambda r: r["id"])
    wb = Workbook()

    # ---------------------------------------------------------------- Test Cases
    tc = wb.active
    tc.title = "Test Cases"
    cols = ["ID", "Category", "Scenario", "Layers exercised", "Steps", "Expected result", "Actual result",
            "Status", "Checks passed", "Checks total", "Seconds", "Screenshots"]
    head(tc, 1, cols)
    for r, item in enumerate(results, start=2):
        passed = sum(1 for c in item["checks"] if c["ok"])
        row = [item["id"], item["category"], item["title"], item["layers"],
               "\n".join(f"{i}. {s}" for i, s in enumerate(item["steps"], start=1)),
               item["expected"], item["actual"], item["status"], passed, len(item["checks"]),
               item["seconds"], ", ".join(s["file"] for s in item["screenshots"])]
        for col, value in enumerate(row, start=1):
            cell = tc.cell(row=r, column=col, value=value)
            body(cell, bold=col in (1, 8))
        fill = PASS_FILL if item["status"] == "PASS" else FAIL_FILL
        tc.cell(row=r, column=8).fill = fill
        tc.cell(row=r, column=8).alignment = Alignment(horizontal="center", vertical="top")
    widths(tc, [9, 26, 40, 44, 46, 46, 56, 10, 9, 9, 9, 40])
    tc.freeze_panes = "D2"
    tc.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{len(results) + 1}"
    last = len(results) + 1

    # ---------------------------------------------------------------- Summary
    sm = wb.create_sheet("Summary", 0)
    sm["A1"] = "LegalLens end-to-end test results"
    sm["A1"].font = Font(name=FONT, size=16, bold=True, color="1F3A5F")
    meta = [
        ("Run date", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ("Environment", "Real backend (FastAPI, SQLite + FTS5 + sqlite-vec), single throw-away data folder"),
        ("AI layer", "Ollama on this Mac: qwen2.5:14b-instruct (answer, summary, draft), llama3.2:3b (rewrite); "
                     "bge-m3 embeddings and bge-reranker-v2-m3, in-process"),
        ("Method", "Playwright drives the UI; every step is also checked against the backend's own records "
                   "(API responses, model id, tokens, citations). Screenshots are on the Evidence sheet."),
    ]
    for i, (k, v) in enumerate(meta, start=3):
        sm.cell(row=i, column=1, value=k).font = Font(name=FONT, bold=True)
        c = sm.cell(row=i, column=2, value=v)
        c.font = Font(name=FONT)
        c.alignment = WRAP
        sm.merge_cells(start_row=i, start_column=2, end_row=i, end_column=6)
    sm.row_dimensions[5].height = 32
    sm.row_dimensions[6].height = 32

    head(sm, 8, ["Measure", "Count"])
    rng_status = f"'Test Cases'!$H$2:$H${last}"
    rows = [
        ("Test cases", f"=COUNTA('Test Cases'!$A$2:$A${last})"),
        ("Passed", f'=COUNTIF({rng_status},"PASS")'),
        ("Failed", f'=COUNTIF({rng_status},"FAIL")'),
        ("Pass rate", "=IF(B9=0,0,B10/B9)"),
        ("Checks run", f"=SUM('Test Cases'!$J$2:$J${last})"),
        ("Checks passed", f"=SUM('Test Cases'!$I$2:$I${last})"),
    ]
    for i, (k, f) in enumerate(rows, start=9):
        a = sm.cell(row=i, column=1, value=k)
        b = sm.cell(row=i, column=2, value=f)
        body(a, bold=True)
        body(b)
    sm["B12"].number_format = "0%"

    categories = sorted({r["category"] for r in results})
    head(sm, 17, ["Category", "Cases", "Passed", "Failed"])
    for i, cat in enumerate(categories, start=18):
        sm.cell(row=i, column=1, value=cat)
        sm.cell(row=i, column=2, value=f"=COUNTIF('Test Cases'!$B$2:$B${last},A{i})")
        sm.cell(row=i, column=3, value=f"=COUNTIFS('Test Cases'!$B$2:$B${last},A{i},{rng_status},\"PASS\")")
        sm.cell(row=i, column=4, value=f"=COUNTIFS('Test Cases'!$B$2:$B${last},A{i},{rng_status},\"FAIL\")")
        for col in range(1, 5):
            body(sm.cell(row=i, column=col))
    start = 18 + len(categories) + 2
    head(sm, start, ["Layer / workflow", "Cases touching it", "Passed", "Failed"])
    layer_keys = [
        ("UI (React)", "UI"),
        ("API (FastAPI routes, SSE)", "API"),
        ("Router (mode and keywords)", "router"),
        ("Hybrid search (FTS5 + sqlite-vec)", "search"),
        ("Reranker (bge-reranker-v2-m3)", "rerank"),
        ("Local LLM (Ollama: qwen2.5:14b, llama3.2:3b)", "qwen2.5"),
        ("Background worker / job queue", "job"),
        ("Checker (citations verified)", "checker"),
        ("SQLite records", "SQLite"),
    ]
    for i, (name, key) in enumerate(layer_keys, start=start + 1):
        sm.cell(row=i, column=1, value=name)
        sm.cell(row=i, column=2, value=f"=COUNTIF('Test Cases'!$D$2:$D${last},\"*{key}*\")")
        sm.cell(row=i, column=3, value=f"=COUNTIFS('Test Cases'!$D$2:$D${last},\"*{key}*\",{rng_status},\"PASS\")")
        sm.cell(row=i, column=4, value=f"=COUNTIFS('Test Cases'!$D$2:$D${last},\"*{key}*\",{rng_status},\"FAIL\")")
        for col in range(1, 5):
            body(sm.cell(row=i, column=col))
    widths(sm, [48, 16, 12, 12, 20, 20])

    # ---------------------------------------------------------------- Checks
    ck = wb.create_sheet("Checks")
    head(ck, 1, ["Test case", "Check", "Result", "Detail"])
    r = 2
    for item in results:
        for c in item["checks"]:
            values = [item["id"], c["desc"], "PASS" if c["ok"] else "FAIL", c.get("detail") or ""]
            for col, v in enumerate(values, start=1):
                body(ck.cell(row=r, column=col, value=v))
            ck.cell(row=r, column=3).fill = PASS_FILL if c["ok"] else FAIL_FILL
            r += 1
    widths(ck, [10, 70, 10, 70])
    ck.freeze_panes = "A2"

    # ---------------------------------------------------------------- Backend evidence
    be = wb.create_sheet("Backend evidence")
    head(be, 1, ["Test case", "What the backend recorded", "Value"])
    r = 2
    for item in results:
        for key, value in item["backend"].items():
            text = json.dumps(value, ensure_ascii=False, indent=1) if not isinstance(value, str) else value
            for col, v in enumerate([item["id"], key, text[:3000]], start=1):
                body(be.cell(row=r, column=col, value=v))
            r += 1
    widths(be, [10, 40, 110])
    be.freeze_panes = "A2"

    # ---------------------------------------------------------------- Evidence (screenshots)
    ev = wb.create_sheet("Evidence")
    head(ev, 1, ["Test case", "Status", "Step", "Screenshot"])
    widths(ev, [10, 9, 38, 110])
    r = 2
    for item in results:
        for shot in item["screenshots"]:
            path = EVIDENCE / "screenshots" / shot["file"]
            if not path.exists():
                continue
            small = thumb(path)
            img = XlImage(str(small))
            ev.cell(row=r, column=1, value=item["id"])
            ev.cell(row=r, column=2, value=item["status"])
            ev.cell(row=r, column=3, value=f"{shot['label']}\n({shot['file']})")
            for col in (1, 2, 3):
                body(ev.cell(row=r, column=col), bold=col == 1)
            ev.cell(row=r, column=2).fill = PASS_FILL if item["status"] == "PASS" else FAIL_FILL
            ev.add_image(img, f"D{r}")
            ev.row_dimensions[r].height = img.height * 0.76 + 6
            r += 1
    ev.freeze_panes = "A2"

    # ---------------------------------------------------------------- Findings
    fd = wb.create_sheet("Findings")
    head(fd, 1, ["#", "Found by", "Finding", "Impact", "Resolution", "Status"])
    findings = [
        ("TC-18", "A draft started from the chat with \"All documents\" in scope had no supporting documents, so no "
                  "paragraph was written by the model and the letter was all placeholders (draft model id: stub).",
         "High: the draft workflow looked connected but the AI layer was bypassed.",
         "Default supporting documents are the client's own documents in the matter "
         "(orchestrator/stub/orchestrator.py); regression test added; re-run shows model id qwen2.5:14b-instruct.",
         "Fixed and re-tested"),
        ("TC-17 / TC-17b", "Asking for \"a memo\" in plain words in Auto mode produced a response letter, because the "
                           "composer always sent its draft-type setting.",
         "Medium: the user's words were ignored.",
         "The draft type is sent only in Draft mode (features/composer/useAsk.ts); Auto mode lets the words decide.",
         "Fixed and re-tested"),
        ("TC-12", "\"Ask again\" was verified only on screen at first; the backend record is now polled until the "
                  "new answer has text, a state and the model id.",
         "Low: test gap.", "Case TC-12 checks the stored message.", "Closed"),
        ("TC-13", "Delete has no confirmation dialog: it removes the chat at once and commits after a five-second "
                  "Undo toast.", "Information: by design (FE-3.4).",
         "Cases TC-13 and TC-13b cover the delete and the undo.", "As designed"),
        ("TC-17", "A memo is built from the memo template with quoted facts and placeholders; the model writes no "
                  "memo text (law may come only from uploaded authority, DEC-45).",
         "Information: the memo's model id is the stand-in.", "Documented; a model-written memo is not built.",
         "Known limitation"),
        ("Ask", "The first words of an answer arrive as the model writes them (real streaming), then the checked "
                "text replaces them; before this run Ask waited for the whole answer.",
         "Information.", "Covered by backend tests and TC-04.", "Done"),
    ]
    for i, (found_by, finding, impact, resolution, status) in enumerate(findings, start=2):
        for col, v in enumerate([i - 1, found_by, finding, impact, resolution, status], start=1):
            body(fd.cell(row=i, column=col, value=v))
        fd.cell(row=i, column=6).fill = PASS_FILL if status != "Known limitation" else BAND
    widths(fd, [5, 16, 70, 36, 60, 18])

    wb.calculation.fullCalcOnLoad = True  # Excel and Numbers compute the Summary formulas when the file opens
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUTPUT)
    print(f"Wrote {OUTPUT} ({len(results)} test cases)")


if __name__ == "__main__":
    main()
