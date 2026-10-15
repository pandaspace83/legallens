# LegalLens audit: requirements against what was built

**Date:** 2026-10-15 (updated after the follow-up build) · **Scope:** every requirement in the BRD (FR, NFR and the §1 and §2 to §4 targets) · **How to read it:**
*Met* means built and checked by a test named in the last column; *Partly* says what is missing; *Not met* says why.
Evidence IDs: **TC-nn** is a UI case in `test-evidence/LegalLens_E2E_Test_Results.xlsx` (27 cases, 27 pass, real backend
and local models); **GS** is `GOLDEN_SET.md`; **GB** is `GATE_BENCHMARK.md`; **pytest** names a backend test file.

## 1. Summary

| | Count |
|---|---|
| Requirements audited (FR and NFR) | 26 |
| Met | 26 |
| Partly met | 0 |
| Not met | 0 |
| Targets (§4) met | 9 of 9 |

The four non-negotiables hold: answers only from the documents (TC-07, GS 10/10 "not found", 0 invented), all AI local
(outbound-socket test), the lawyer decides (nothing is sent or filed), and clients stay separate (TC-23, leak tests).

## 2. Functional requirements

| ID | Requirement (short) | Status | What was built | Evidence |
|---|---|---|---|---|
| FR-ASK-01 | Answer only from the matter; label found, not found, partial | Met | Router, hybrid search, reranker gate, local model, checker; states on every answer | TC-04, TC-07, GS |
| FR-ASK-02 | Scope: one document or all; follow-ups keep context | Met | Scope selector; llama3.2:3b rewrites follow-ups with the last 6 turns | TC-06, TC-14 |
| FR-ASK-03 | Pinpoint cite; click opens the highlighted passage | Met | Page, paragraph and clause per citation; viewer highlight; previous/next citation | TC-05 |
| FR-ASK-04 | Outside law: say so, suggest uploading; "good law not checked" on uploads | Met | Outside-law notice and flag; an answer that cites an uploaded opinion or statute ends with "Good law not checked: …" | TC-08, pytest llm/test_local_ask |
| FR-SUM-01 | Three templates, every field cited or "Not found" | Met | letter/demand, pleading, opinion; per-field retrieval and check | TC-14, pytest llm/test_local_summary |
| FR-SUM-02 | Three audience presets | Met | one paragraph, detailed, plain English (backend); UI preset | pytest llm/test_local_summary |
| FR-SUM-03 | Coverage report with OCR confidence | Met | pages read, unreadable, OCR confidence | TC-03, TC-14 |
| FR-DRF-01 | Editor beside the chat; refine by chat; regenerate a section | Met | Draft panel, refine, regenerate, proposals as previews | TC-18, pytest api drafts |
| FR-DRF-02 | Every statement from an uploaded passage, an instruction or the profile | Met | Model paragraph kept only if every citation and figure checks; else a quoted-passage fallback | TC-18, pytest llm/test_local_draft |
| FR-DRF-03 | List each claim and show whether answered | Met | Point-by-point with addressed, flagged, missing, waived | TC-18 (7 claims) |
| FR-DRF-04 | No model-introduced authority; [CITE NEEDED], [UNVERIFIED] | Met | Authority detector rejects model text; placeholders and wrapping | TC-18, pytest llm/test_local_draft |
| FR-DRF-05 | Memo: Question, Brief Answer, Facts, Discussion, Conclusion; law only from uploads | Met | Structure and [RULE NEEDED]; the Statement of Facts is written by the local model under the letter checks (quoted facts on any failure); Rule and Application stay the lawyer's | TC-17, TC-17b, pytest llm/test_local_draft |
| FR-DRF-06 | Rule 4.2 / 4.3; FRE 408 opt-in | Met | Addressee rule and reminders; FRE 408 header toggle | TC-18, pytest unit/test_text_rules |
| FR-DRF-07 | Export only after authorities acknowledged, no placeholders, signed off | Met | Export gate with the reasons listed; sign-off logged | TC-19 |
| FR-DRF-08 | Clean .docx with no internal cites, comments or properties; automated check | Met | Built fresh; re-opened and checked on every export | TC-19, pytest security |
| FR-MAT-01 | One matter per item; profile, consent, licensing state | Met | Matter scope guard on every query; profile; consent record | TC-02, TC-23 |
| FR-MAT-02 | Close, export, delete with typed confirmation; backups cleared within 35 days | Met | Close, export, typed delete and real deletion; `backup prune` removes backups older than 35 days (run it on a schedule) | e2e-real flow 10, pytest security/test_isolation |
| FR-DOC-01 | Ingest PDF, DOCX, scans, email; 300 pages / 50 MB / 200 per matter | Met | Docling, OCR, email split; limits enforced | TC-03, TC-16 |
| FR-DOC-02 | Untrusted uploads: allowlist, malware scan, origin tag, hidden text | Met | ClamAV fail-closed, hidden-content sanitising, origin tags | pytest security/test_hygiene, TC-03 |

## 3. Non-functional requirements

| ID | Requirement (short) | Status | What was built | Evidence |
|---|---|---|---|---|
| NFR-01 | Matter filter on every search and cache; leak tests, 0 allowed | Met | Scope guard plus SQL filter on both search legs | TC-23, pytest security/test_isolation |
| NFR-02 | No document content leaves the computer, proven by a test | Met | Outbound sockets blocked in tests; Ollama URL must be local | pytest security |
| NFR-03 | MFA, session timeout, encryption in transit and at rest, incident plan | Met | Real mode: argon2id, TOTP, lockout, CSRF header; SQLCipher and sealed files; idle and absolute timeouts; `serve --https` with a local certificate; `INCIDENT_PLAN.md` | pytest security/test_real_auth, test_encryption |
| NFR-04 | Encrypted backups under the lawyer's keys, restore tested | Met | `backup create / verify / restore`; the key is outside the backup | pytest security/test_encryption |
| NFR-05 | Append-only audit; answers replayable | Met | Hash-chained audit; retrieval trace, model and prompt version per answer | pytest api/test_audit, TC-04 |
| NFR-06 | 30 to 50 question set runs on every change and blocks release | Met | 34-question golden set; `scripts/release_gate.sh` runs the suites and the set and fails on any drop from `golden_baseline.json` or any invented answer. The fast checks run in GitHub Actions on every push (green since 2026-10-15); the golden-set gate runs in GitHub Actions on a self-hosted runner (the Mac with Ollama) nightly and on changes to the answering code, and passed on 2026-10-15 | GS |
| NFR-07 | Swappable model named on output; WCAG 2.1 AA; feedback feeds the test set | Met | Model id on every message; axe passes on every screen; `legallens feedback export` writes candidate cases for review | TC-04, TC-21, TC-11 |

## 4. Targets (DEC-14) and success measures

| Measure | Target | Result | Status |
|---|---|---|---|
| First words of an answer | 5 s | about 0.5 s warm, a few seconds with retrieval (tokens stream as written) | Met |
| Full answer | 30 s | Ask uses the 7B since 2026-10-15: 7 s average in the model comparison, 23 s average in the golden set including model swaps; the first UI answer after a model swap took 41 s (the 14B took 33 to 46 s in the UI cases) | Met |
| 50-page summary | 5 min | 204 s on qwen2.5:7b (documents over 20 pages use it); 598 s on the 14B; the figure on page 37 was found (`tests/slow/test_long_document.py`) | Met |
| Letter draft | 3 min | 74 s (TC-18) | Met |
| Citations that exist and support their sentence | 95% | 27 of 27 answerable golden-set questions fully verified on the 7B (100%; 37 questions, 10 of 10 "not found" correct); 0 invented | Met |
| Invented authority | 0 | 0 in the golden set and UI cases | Met |
| Cross-matter leaks | 0 | 0 | Met |
| Exports with metadata | 0 | 0 (checked on every export) | Met |
| Every incoming point answered or flagged | all | 7 of 7 | Met |

## 5. What is left

1. **The golden set is small and made by us:** 37 questions on six synthetic documents. A lawyer's review and more
   real-world phrasings are what would move this from "passes" to "trusted" (OPEN-01).
2. **The gate depends on one Mac.** It runs on a self-hosted runner there; a cloud VM with Ollama would remove
   that dependency (a decision on cost, not on code).
3. **A lawyer's review of the golden set** (OPEN-01), and Application and Rule text in memos stay with the lawyer by
   design (DEC-45).
4. **The BRD page count** was not re-measured after one sentence was added to FR-DRF-05.

## 6. Layer connections verified (for the question "is everything wired?")

UI → API (REST, SSE) → run service → router (mode or keywords) → workflow:
- **Ask:** rewrite (llama3.2:3b, only with history) → hybrid search (FTS5 + sqlite-vec) → bge reranker → gate →
  qwen2.5:14b answer, streamed → rule-based checker → answer text, citations, trace, usage saved. TC-04, TC-06, TC-07.
- **Summarize:** a job in the queue → worker → per-field retrieval → local model → checker → summary with citations;
  documents over 20 pages use the 7B to stay inside the time target. TC-14, TC-16.
- **Draft:** a job → claim extraction → facts from the client's documents → local model per point → checker →
  safeguards and placeholders → export gate. TC-18, TC-19. Memos use the template. TC-17.
- **Health:** every component reports its state and the engine names its model. TC-20.
