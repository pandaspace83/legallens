# AI workflows (ASK, SUMMARY, DRAFT): review and fix plan

**Status (2026-10-14):** built for the **fully local** option (decision: nothing leaves the machine). ASK, SUMMARY and DRAFT run on a local model through Ollama; Phases 0–4 are done and tested. Open: choose the final local models by comparison (Phase 2 tail), the Opus review (WF-5.4), and the items under "Follow-ups". The earlier Haiku plan is kept as `WORKFLOWS_TODO.v0-haiku.md`.

## Update: what changed from the plan above

- **No cloud model.** Anthropic models can't run locally, so Haiku/Sonnet/Opus became local open-source models: `llama3.2:3b` rewrites questions and `qwen2.5:7b-instruct` answers, summarizes and drafts (this Mac: M3, 16 GB). Names are settings (`LEGALLENS_LLM_*`); a bigger model is a config change.
- **W6** is `models/llm.py`: a thin async Ollama client (127.0.0.1 only) behind a `ChatModel` protocol, instead of LangChain. Nothing in the new code imports LangChain or calls Anthropic.
- **W8 is moot:** nothing leaves the machine; the existing no-outbound test still holds.
- **W1:** `LocalOrchestrator` extends the stub (same routing, search, rerank, gate and events); `LEGALLENS_ORCHESTRATOR=local` turns it on, `stub` stays the default.
- **W3 deviation:** a document that fits the window (16,000 characters) goes to the model whole, in reading order; a longer one gets the 10 most relevant passages per field. No map-reduce yet.
- **W4 scope:** the model writes the response paragraph for each point of a *response letter* only, from the supporting documents. Memos stay template-based (their Rule step needs uploaded authority, which the model must not invent).
- **Verifier** (`orchestrator/local/text.py`), shared by all three: markers must point at a given passage; the quote must be literal in that passage; every number in a claim must appear in it; the shown quote is the sentence closest to the claim. Anything that fails falls back to the quoted-passages text.
- **Summaries** write only fully verified fields; the rest use the quotes (`content_json.fallback_fields` lists them).
- **Drafts** use a model paragraph only if all citations verify, all numbers check, and it names no authority (`drafting/authorities.find`).


**Models (your choice, unchanged):** Haiku 4.5 (`claude-haiku-4-5-20251001`) rewrites questions and classifies intent; Sonnet 5.5 (`claude-sonnet-5-5`) answers ASK; Opus 5.5 (`claude-opus-5-5`) drafts; SUMMARY uses Opus or Sonnet depending on the summary (W5). Retrieval, reranking and the "Not found" gate are the ones already built in EMBEDDINGS_TODO.

## Verdict on the code written earlier today

The code isn't clean, and patching it isn't worth it. None of it is wired in, so the running app is unaffected. Rebuild it on the contracts the app already has (W1–W4); nothing in it needs to be kept.

**Breaks at runtime**
- Model IDs are retired or don't exist (`claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-5-opus-20241022`). DRAFT and the detailed SUMMARY can never succeed.
- ASK runs `await` on an async generator (`_emit_citation_events`). Every answer streams, then raises `TypeError`, and the catch-all appends "An error occurred…" and marks the answer `not_found`.
- SUMMARY's document loader returns `""`, so every summary ends with "Could not retrieve content".
- SUMMARY sets `llm.model_name` on a shared ChatAnthropic object. That raises, and if it didn't, two concurrent runs would switch each other's model.
- All model calls are blocking (`invoke`, `stream`) inside `async` code. One long answer would freeze the whole server, including every other open stream.

**Breaks the product rules**
- **DEC-21 (answer only from documents, cited):** no CitationEvent is ever emitted, the prompt never says "only from these passages", and nothing checks the quotes.
- **DEC-37 ("Not found" gate):** there's no gate. Hybrid search always returns something, so Sonnet answers from irrelevant passages.
- **DEC-38 (outside-law flag)** and **DEC-69 (trace)** are missing.
- **Fixed messages are sent to the model:** the "Not found", error and rerank-failed texts go to Sonnet as prompts instead of being shown as written. The model then answers them, inventing content.
- **The DRAFT memo prompt asks for "applicable law"**, which invites made-up cases and statutes. The app's own safeguards (`[UNVERIFIED]`, "Rule needed") are bypassed.
- **DRAFT and SUMMARY stream free text into the chat instead of starting the jobs.** That skips the summaries and drafts tables, the panels, citations, the checklist, the review lock and exports (DEC-40–47). The formatted draft is computed and thrown away, and it would have put `[Attorney Name]` back.
- **Prompt injection:** document text goes into the prompt with no "treat this as data" boundary.

**Privacy**
- The error logger writes to `backend/src/logs/errors/`, inside the iCloud-synced Desktop folder, with the question text, chunk text and model output. It also propagates to the app log. That breaks the rule that client text never reaches logs, and the log-hygiene test would catch it once wired in. A 44 KB file is already there (7 entries, all `TypeError`s from the test run).

**Tests and docs**
- The ASK tests pass only through the error fallback; the 7 `TypeError`s above are those runs. The SUMMARY and DRAFT test files hold 0 assertions. Two ASK tests fail and five error.
- `ORCHESTRATOR_ASK_STATUS.md` and `ORCHESTRATOR_ALL_WORKFLOWS_STATUS.md` say "production-ready". That's wrong.
- The status steps `chunking`, `merging`, `parsing`, `assembling` and `formatting` aren't in the frontend's `RunStep` type.

## Decisions for you to approve

- **W1. One orchestrator, the same shape as the stub.** `LangChainOrchestrator` implements the existing `Orchestrator` protocol and is selected by `LEGALLENS_ORCHESTRATOR=langchain`; the stub stays the default until Phase 5 passes.
  - It routes like the stub: explicit modes and draft refinement by rule, and `auto` through the Haiku intent classifier.
  - ASK runs inline. Summarize and draft start the existing jobs through `services.start_summary` and `services.start_draft`, exactly as the stub does.
  - API, events, stored data and frontend don't change.
- **W2. ASK pipeline:**
  1. Haiku rewrites the question. It's skipped entirely when the history is empty.
  2. `services.search`, 25 per leg.
  3. `services.rerank`, the cross-encoder, top 8. The Sonnet LLM reranker is dropped.
  4. The gate (DEC-37), unchanged for now. When it fails, the fixed "Not found" text is streamed and no answer model is called.
  5. Sonnet answers from the numbered passages only, with `[n]` markers. Passages sit inside delimiters and are marked as data, not instructions.
  6. Verify: each `[n]` must point at a passage it was given. The quote comes from that passage (`best_sentence`/`pinpoint`, as in the stub), and any quoted text in the answer must appear verbatim in a passage, or the citation is `verified=false`.
  7. Events: CitationEvent, AnswerState (with the DEC-38 outside-law flag), Trace, and Usage from the real token counts.
- **W3. SUMMARY: the LLM goes inside the summarize job, not the chat.** The job keeps its templates (letter or demand, pleading, opinion), audiences, fields, chunk-anchored citations and "Not found in this document".
  - Map: read the whole document in reading order (DEC-40), in batches of about 20 chunks. Each batch returns the facts for each field, with chunk ids.
  - Reduce: write each field from those facts, citing chunk ids. Uncited sentences are dropped.
- **W4. DRAFT: Opus goes inside `drafts.generate`, not the chat.** Opus fills the existing template structure: sections, the claims taken from the incoming letter, facts with citations, and placeholders ("Missing fact", "Citation needed", "Rule needed").
  - Any authority it names goes through `drafting/authorities.py` and comes back `[UNVERIFIED]`.
  - Output that fails validation falls back to the template drafter, with a note.
  - The signer stays the matter owner.
  - The checklist, review lock and export keep working untouched.
- **W5. SUMMARY model choice:** Sonnet for the map step. For the write step, Opus for the `detailed` audience or documents over 40 pages, and Sonnet for `one_paragraph` and `plain_english`. Thresholds go in settings.
- **W6. One LLM layer** (`models/llm.py`), with model IDs in settings, async calls only, and a timeout, retries and max_tokens per call.
  - It also normalises text versus content-block replies and reads the real usage.
  - Without `ANTHROPIC_API_KEY` the app falls back to the stub, which already shows the "Stand-in answers" badge, and `/health` says why.
- **W7. Error logs, per your rule:** a **new file for every failure, named after the error.** Files go to `<data_dir>/logs/errors/<ErrorName>_<UTC timestamp>.log`, e.g. `RateLimitError_20261013T224512Z.log`.
  - Contents: stage, run id, matter id, model, error class, the SDK message and the traceback.
  - Never question text, history, passages or model output; a canary test proves it.
  - The folder is outside the synced Desktop and the source tree.
- **W8. What leaves the machine.** Today nothing does: there's a test asserting no outbound connections. With `langchain` on, only `api.anthropic.com` receives data:
  - ASK: the rewritten question, the last turns of history and up to 8 passages.
  - SUMMARY: the selected document, in batches.
  - DRAFT: the incoming letter and the supporting passages.

  The test changes to "only that host, and only when langchain is on". **Please confirm this is acceptable for client documents.**
- **W9. Delete, as part of the go-ahead:**
  - `orchestrator/ask/`, `orchestrator/summary/` and `orchestrator/draft/`
  - the three `tests/unit/test_orchestrator_*.py` files
  - both `ORCHESTRATOR_*_STATUS.md` files
  - `backend/src/logs/`
  - `WORKFLOWS_TODO.v0-haiku.md`, once you're happy with this file

## Open question (from 2026-10-13, now due)

- **Q1. How much chat history the rewriter sees.** `RunContext.history` already holds the last 6 turns. Proposal: send all 6 turns, cut each assistant turn to its first 1,500 characters, and strip the `[n]` markers. Only Haiku sees the history; Sonnet gets just the rewritten question plus the original wording.

## Phase 0: Clean slate

- [x] WF-0.1 Delete the W9 files.
- [x] WF-0.2 Settings: `orchestrator: stub | langchain`, the model IDs, the summary thresholds (W5), and LLM timeouts and retries.
- [x] WF-0.3 `models/llm.py` (W6), with a fake chat model for tests.
- [x] WF-0.4 `orchestrator/errors.py` (W7).

## Phase 1: Tests first (fake model, no key needed)

- [x] WF-1.1 Same event order as the stub for ask, summarize, draft, refine and clarify. *(the stub's own tests cover the shared flow; `tests/llm/test_local_ask.py::test_summarize_and_draft_still_start_their_jobs` covers the local branch)*
- [x] WF-1.2 Rewriter: empty history never calls Haiku; unrelated history leaves the question as it is; a follow-up is rewritten; a model failure falls back to the original question.
- [x] WF-1.3 Gate fails: the fixed "Not found" text, and the answer model is never called.
- [x] WF-1.4 Citations: an out-of-range `[n]` is dropped; a misquote is marked `verified=false`; the trace and usage are emitted.
- [x] WF-1.5 A passage that says "ignore previous instructions" doesn't change the system prompt or the answer's rules (prompt-injection check).
- [x] WF-1.6 Error log: one new file per failure, named after the error, with no client text (canary).
- [x] WF-1.7 Summary job: every field cited or marked "Not found in this document"; the whole document is read.
- [x] WF-1.8 Draft job: output passes the drafting checks; authorities come back `[UNVERIFIED]`; the signer is the owner.

## Phase 2: ASK and routing

- [x] WF-2.1 Rewriter prompt with the guardrails: empty history means unchanged; unrelated or mutually exclusive history means unchanged; never answer the question, add facts or swap the user's legal terms.
- [x] WF-2.2 Answer prompt and the verify step (W2).
- [x] WF-2.3 `LangChainOrchestrator` with routing; the summarize and draft branches call the jobs.
- [x] WF-2.4 `orchestrator/langchain_intent/` calls the Anthropic API, so it can't be wired in under the no-outbound rule. Decision needed: delete it, or port the classifier to the local model. *Deleted 2026-10-14; `langchain` and `langchain-anthropic` dropped from pyproject.*

## Phase 3: SUMMARY job

- [x] WF-3.1 Map-reduce in `jobs/handlers/summarize.py` (W3, W5); progress steps stay `reading`, `extracting`, `writing`, `verifying`.

## Phase 4: DRAFT job

- [x] WF-4.1 Opus in `drafts.generate` (W4), with validation and the template fallback.

## Phase 5: Checks

- [x] WF-5.1 Full pytest, ruff and mypy. *Now: 202 passed, slow model tests pass; the only ruff/mypy errors are in `langchain_intent/` (WF-2.4).* *Done 2026-10-14: pytest all pass, ruff and mypy clean.*
- [x] WF-5.2 `pytest -m llm`: a few real calls to Ollama, skipped when it or a model is missing. *Done 2026-10-14: `tests/slow/test_real_llm.py`, 4 tests in 11 s; excluded from the default run.*
- [x] WF-5.3 `e2e:real` with `LEGALLENS_ORCHESTRATOR=local`, plus the outbound and hygiene security tests. *Done 2026-10-14: 10/10 pass in 1.6 min (`LEGALLENS_ORCHESTRATOR=local npm run test:e2e:real`); flows 4-6 wait up to 180 s and accept "Partially found" in local mode. Security tests are in the default pytest run.*
- [x] WF-5.4 Opus review before calling it done. *Done 2026-10-14; findings below, all fixed with tests.*

## Later

- Move the "Not found" gate onto the reranker score after a benchmark (EMBEDDINGS_TODO D5).
- Trim the bge-m3 download (EMBEDDINGS_TODO follow-ups).

## WF-5.4 review findings (2026-10-14, all fixed)

1. **Draft job held the SQLite write lock through every model call.** Any other write in the app timed out after 5 s while a draft was generating. Now the draft is composed in a read session and saved in a short write; each point reports progress (fresh heartbeat, visible progress, cancel works between points).
2. **The other side's letter text sat in the prompt's instruction line** (prompt injection by opposing counsel). It now goes in a delimited `<point>` block the system prompt calls data.
3. **A model "not found" could hide passages** the keyword gate had matched (e.g. a summary's Deadlines field). Now ASK and SUMMARY fall back to quoted passages instead.
4. **Figures in uncited sentences were never checked.** Every number in an answer must now be in a cited passage (or, for a draft, the point it answers); otherwise ASK is "partial", SUMMARY and DRAFT fall back.
5. **Curly vs straight quotes failed literal quotes;** ellipses too. Quotes are compared after normalising those.
6. **Provenance:** summaries named the model when every field had fallen back; drafts named the stub when the model wrote paragraphs. Both now record who actually wrote it.
7. **The client retried timeouts and HTTP errors,** doubling the worst wait to 10 minutes. Now only a refused connection is retried.
8. Smaller: filenames are stripped of `"<>` in prompt labels; every spelling of `<passage>`/`<point>` tags in document text is neutralised; a rewrite that answers instead of asking is rejected; number words thirteen–nineteen were missing; a claim sharing no words with its passage is marked not verified.

**Known limit:** "verified" means the quote is literal, the figures are in the passage and the claim shares words with it. It does not mean the model understood the clause; a 7B model can still draw a wrong conclusion from a right passage (seen in a real draft: "remain unpaid, which contradicts the demand"). The review lock and `[CITE NEEDED]` keep a person in the loop.

## Follow-ups

- **Local model choice (Phase 2 tail):** compare two or three candidates on your documents (answer quality, citation accuracy, speed) and set the winners in settings. Candidates to try: `qwen2.5:7b-instruct` (now), a 14B build, and another 7–8B family.
- **WF-2.4 decision:** delete or port `langchain_intent/`; also drop the unused `langchain` and `langchain-anthropic` dependencies.
- **Speed:** a 7B answer takes about 15–30 s here; a full summary about 1 minute; a draft about 30 s. The first call after Ollama starts is slower (model load).
- **Not done:** memo drafting by the model; map-reduce for very long documents; `pytest -m llm` real-model tests (WF-5.2); `e2e:real` with `LEGALLENS_ORCHESTRATOR=local` (WF-5.3), whose flow 4 asserts the stub's "From your documents" wording and needs a local-mode variant.
- **Run Ollama:** `brew services start ollama` (or `ollama serve`), then `ollama pull llama3.2:3b qwen2.5:7b-instruct qwen2.5:14b-instruct`.

## Model comparison (2026-10-14)

ASK on 11 sample-document questions (`backend/tests/slow/test_model_comparison.py`, results in `MODEL_COMPARISON.md`): qwen2.5:7b 10/11 at ~7 s, qwen2.5:14b 11/11 at ~24 s. **`llm_answer_model` is now `qwen2.5:14b-instruct`**; rewrite stays `llama3.2:3b`, summary and draft stay on 7B (not compared yet). The 7B's failure was a "Not found" behind a `[1]` marker, which the checker treated as an answer; `check_answer` now treats a marker-prefixed refusal as a refusal and drops a stray refusal sentence after a real answer. Watch RAM: the 14B (~9 GB) shares 16 GB with bge-m3 and the reranker.

**Summary and draft comparison (2026-10-14, `MODEL_COMPARISON_SUMMARY_DRAFT.md`):** on the demand letter, the 7B got 6/7 summary fields right (it named a threat sentence as the sender) in 39 s and the 14B 7/7 in 218 s; drafts took 13 s and 126 s. Both cited the MSA on 7/7 points; the 14B wrote real reasoning on point 1 (the MSA gives 30 days to pay, the letter demands 14), the 7B mostly fell back to quoted passages. **All three LLM jobs now default to `qwen2.5:14b-instruct`**; only the rewrite stays on `llama3.2:3b`. One sample document and one letter, so treat it as a rough signal.
