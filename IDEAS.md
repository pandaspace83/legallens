# LegalLens: Ideas

> **Status:** Ideas closed, BRD v0.1 drafted · **Last updated:** 2026-10-05
>
> Every idea is now in one of four buckets, with an ID that never changes. The requirements themselves are
> in the BRD, which cites these IDs:
> [LegalLens: Product Requirements (BRD / PRD / FRD)](https://claude.ai/code/artifact/22d52891-447c-45a0-a145-ab2cd51408e3).
> The version before this restructure is kept in `IDEAS.v0-2026-10-02.md`.

## How this file works

| Bucket | ID | Meaning |
|---|---|---|
| **Decided** | `DEC-nn` | Agreed. Goes into the BRD as a requirement or a constraint. |
| **Suggested** | `SUG-nn` | Recommended but not explicitly confirmed. The BRD treats these as proposals. |
| **Open** | `OPEN-nn` | Still needs an answer. The BRD lists each one as an open item, with a working assumption where there is one. |
| **Deferred** | `DEF-nn` | Not in the MVP. Planned for `V1.x` (soon after the MVP) or `Future` (multi-agent, or if LegalLens grows beyond one lawyer), or decided in a later document. |

The risk register uses `RISK-nn` (§6).

**ID rules:** IDs are never reused or renumbered. If an item moves to another bucket, it gets a new ID and the old
entry stays behind as a one-line pointer, e.g. `SUG-nn → DEC-nn (accepted <date>)`, so older references
always resolve.

**Contents:** 1 Vision · 2 Decided · 3 Suggested · 4 Open · 5 Deferred · 6 Risk register · 7 Where the old
sections went · 8 Glossary · 9 Background reading

---

## 1. Vision

LegalLens is an AI assistant for a lawyer. It helps them **ask** questions about their documents,
**summarize** legal documents, and **draft** responses and memos for the lawyer to review before
anything is sent or submitted. Every answer can be traced back to a source document, and the AI runs
entirely on infrastructure the lawyer controls.

---

## 2. Decided (DEC)

### 2.1 Foundations

Decided on 2026-10-02 unless a later date is shown.

- **DEC-01 Name:** LegalLens.
- **DEC-02 Main user:** A single solo lawyer with one workspace and one sign-in. No shared logins, and the
  MVP has no team features, roles or firm admin. They need to understand documents quickly, respond to
  letters and opposing counsel, and draft memos. Every answer must be easy to check. Cost and Word export
  matter.
- **DEC-03 Real project:** LegalLens is built for real legal documents. Testing may use non-legal or public
  documents. Confidentiality and AI-ethics requirements are part of the MVP, not deferred.
- **DEC-04 Jurisdiction:** US federal and state, in English, following US legal conventions. Ask answers only from
  uploaded documents, so LegalLens needs no built-in knowledge of any state's law. MVP drafts (letters and
  memos) don't depend on court rules. From V1.x, court procedure and formatting rules come from curated,
  versioned rule templates or from rule documents the lawyer uploads, never from the AI model's own knowledge.
- **DEC-05 Three core features:**

  | Feature | What the user does |
  |---|---|
  | **Ask** | Types a question into a search/prompt bar and gets an answer from the documents they uploaded. |
  | **Summarize** | Uploads a legal document and gets a summary of it. |
  | **Draft** | Asks LegalLens to draft a response or a legal memo, then reviews the draft before submitting it. |

- **DEC-06 What Ask answers from:** Only the documents the user uploads. Ask does not use the AI model's general
  legal knowledge to fill gaps. There is no general legal research and no case-law database. If a question needs
  law that isn't in the documents, the lawyer is told so clearly. The lawyer can upload court opinions or statutes
  they found elsewhere, and Ask answers from those.
- **DEC-07 What Draft produces:** A draft response for the lawyer to review, edit and export. The lawyer uploads
  the document they need to respond to, explains in a chat what the response should say, and gets a draft. Legal
  memos stay in scope. **LegalLens never sends, files or submits anything.**
- **DEC-08 No outside AI services, for now:** All AI work runs on infrastructure you control. That includes
  answering, summarizing and drafting, plus the behind-the-scenes steps: indexing documents for search
  (embeddings) and OCR. The same goes for anything else that touches documents, including malware scanning,
  error reporting and analytics. The model must be one that can run self-hosted. The AI layer stays swappable in
  case this decision changes.
- **DEC-09 Matters** *(accepted 2026-10-05)*: There is one workspace, and inside it each client case or deal is a
  separate *matter*. Every document, question, summary and draft belongs to exactly one matter. Even a solo
  lawyer has many clients. Keeping each client's documents in its own matter stops one client's confidential
  information from appearing in another client's answer or draft, and gives the AI the right context.
- **DEC-10 MVP draft types** *(accepted 2026-10-05)*:
  1. *Response letter (build first):* a reply to a demand letter or to opposing counsel. It rests mainly on facts
     in the matter's documents and the lawyer's instructions, so it is the safer type to start with.
  2. *Internal legal memo:* depends on legal authority, so it is the riskier type (see DEC-45).

  In the MVP, "submitting" means the lawyer sends a letter to the other side. Court filings come in V1.x (DEF-10).
- **DEC-11 Where it runs** *(2026-10-05)*: On the lawyer's own computer, a high-memory Mac or a PC with a GPU, ideally
  one they already own. The hardware budget is about $0–5k, one-time. What this means:
  - No hosting provider ever sees client data.
  - Models are smaller than a server could run, and long documents take longer. That's why long jobs run in the
    background and why the DEC-14 targets get confirmed on real hardware.
  - Backups that leave the machine are encrypted under keys the lawyer holds.
  - LegalLens is available only while that computer is on.
- **DEC-12 Export format** *(accepted 2026-10-05)*: Word (.docx) only in the MVP. PDF export comes in V1.x (DEF-19).
  Bluebook formatting is out of the MVP (OPEN-03).
- **DEC-13 Retention default** *(2026-10-05)*: Closed matters are kept, read-only, until the lawyer deletes them.
  Deleting removes everything at once (DEC-58). Deleted data ages out of backups within 35 days, and only a
  deletion record with no client content is kept. Retention schedules and legal hold come in V1.x (DEF-15).
- **DEC-14 Speed and size targets** *(2026-10-05; confirmed or adjusted by the Slice 0 benchmark)*:

  | Measure | Starting target |
  |---|---|
  | Ask: first words on screen | ≤ 5 s |
  | Ask: full answer | ≤ 30 s |
  | Summarize a 50-page document | ≤ 5 min, as a background job |
  | Draft a response letter | ≤ 3 min, as a background job |
  | Document size | up to 300 pages or 50 MB |
  | Documents per matter | up to 200 |

- **DEC-15 MVP scope** *(2026-10-05)*: The MVP keeps every item in §2.3–2.10, including all confidentiality and
  security items. The MVP is complete when build Slices 0–5 are done (DEC-72).
- **DEC-16 Tech stack:**
  - Frontend: React with TypeScript *(accepted 2026-10-05)*, plus HTML and CSS. React has a larger ecosystem for
    in-browser PDF viewing with highlighted passages, a chat panel next to a document editor, and streaming
    answers. TypeScript catches mistakes in the data the frontend receives from the API.
  - Backend: Python with **FastAPI**, and **uv** for package and dependency management.
  - AI layer: a **RAG** (retrieval-augmented generation) application for now, possibly multi-agent later (DEF-25).
- **DEC-17 Build in thin vertical slices** *(accepted with DEC-15)*: Frontend, backend and AI remain the three
  *layers* of the design, but they are built *together*, one thin end-to-end slice at a time (DEC-72). Building
  one whole layer at a time would mean nothing works until the very end, and problems connecting the layers
  would show up late.
- **DEC-18 One model interface:** The rest of the app never depends on a particular model. That makes it possible
  to swap in a better local model, or an approved outside provider if DEC-08 changes, and re-run the test set to
  compare.
- **DEC-19 First practice area, working assumption** *(2026-10-05)*: There is no real first user yet. LegalLens is
  built for general civil litigation, and state-specific reminders follow the licensing-state setting (DEC-29).
  To be revisited when a real user is found (OPEN-02).
- **DEC-20 Interim test set** *(2026-10-05)*: Until a lawyer advisor is found (OPEN-01), the test set is built from
  public documents with published answers (e.g. CUAD clause labels) and is marked provisional.

### 2.2 Guiding principles

These follow from DEC-06 to DEC-09 and the MVP scope.

- **DEC-21 Grounded or silent:** Answers come only from the lawyer's uploaded documents, and every claim points to a
  passage. If the documents don't support an answer, LegalLens says "not found in your documents" instead of
  guessing. A statement in a draft may also rest on two other sources. One is the lawyer's own instructions in the
  chat, cited as *Per your instructions* with the date and time. The other is the matter profile, cited as
  *Matter profile*. Both are recorded in the audit trail. Nothing else counts as support.
- **DEC-22 Show your work:** Citations, what was searched, and how much of a document was read are always visible.
- **DEC-23 The lawyer is in charge:** LegalLens drafts, and the lawyer reviews and submits. LegalLens never files,
  sends or decides anything on its own.
- **DEC-24 Each client's documents stay separate:** One client's documents can never appear in an answer or draft
  for another client.
- **DEC-25 Documents are data, not instructions:** Text inside an uploaded document, especially one written by the
  other side, can never change how the AI behaves.
- **DEC-26 Measure before you ship:** A set of test questions reviewed by a lawyer must pass before every release.
- **DEC-27 Client documents never leave infrastructure you control:** No outside AI services, and client data is
  never used to train models.

### 2.3 Workspace and matters

- **DEC-28 One private workspace per lawyer:** The lawyer signs in to a single workspace. If LegalLens is ever
  offered to many lawyers, each workspace must be fully isolated from every other one.
- **DEC-29 Workspace settings:** The lawyer's licensing state(s). Ethics rules on AI use, client consent and
  reviewing metadata differ by state, so LegalLens uses this setting for reminders and defaults.
- **DEC-30 Matter profile:** Records:
  - the client and our side (plaintiff, defendant, buyer…)
  - the opposing parties, whether each is represented, and opposing counsel (name, firm, address, email)
  - the court (federal or state, and which one), jurisdiction and practice area
  - the client's AI-consent record (DEC-60)

  Ask, Summarize and Draft use the profile automatically, so the lawyer never has to retype "we represent the
  defendant in a California employment case."
- **DEC-31 Chat history per matter:** Questions, answers and drafting conversations are saved in the matter, so
  follow-up questions keep their context.
- **DEC-32 Close a matter:** Closing makes the matter read-only and keeps it (DEC-13).
- **DEC-33 Export a matter's full file:** Download all documents, summaries, drafts and chat history for a matter,
  so the lawyer can return or keep the client's file.
- **DEC-34 Delete a matter:** Permanently deletes the matter and everything made from its documents (DEC-58).
  Offered only after an export prompt and a typed confirmation.

### 2.4 Ask

- **DEC-35 Scope selector:** The lawyer chooses *This document* or *All documents in this matter*, so ordinary
  questions across all of a matter's documents are part of the MVP. The screen always shows what is being searched
  (e.g. *Searching: Smith MSA v3 + Exhibits A–B*).
- **DEC-36 Pinpoint citations, click to verify:** Every statement links to document + page + paragraph. Contracts
  use section numbers and depositions use page:line. Clicking a citation opens the document with the passage
  highlighted.
- **DEC-37 Clear answer states:** Each answer is either *From your documents* (with citations) or *Not found in your
  documents*. A partial answer says which parts were found and which weren't.
- **DEC-38 Questions that need outside law:** Take "Is this non-compete enforceable in California?" The documents
  show what the clause says, but not whether California law enforces it. LegalLens says this plainly, shows what
  the documents do say, and suggests uploading the relevant statute or case if the lawyer has it.
- **DEC-39 Bring your own authority:** The lawyer can upload court opinions, statutes or regulations they found in
  their own research. Ask treats these like any other document and cites them. **LegalLens does not check whether
  uploaded authority is still good law.** The lawyer confirms that in their own citator.

### 2.5 Summarize

- **DEC-40 Summary templates by document type:** Three types in the MVP, chosen for civil litigation (DEC-19):
  - *Letter or demand received:* who is asking for what, by when, each claim made, and any threats or deadlines.
    This feeds straight into Draft, so it is always included.
  - *Complaint or other pleading:* parties, causes of action, key allegations, relief sought.
  - *Court opinion (case brief):* facts, procedural posture, issue, holding, reasoning, disposition. This also
    supports memos, which may state law only from uploaded authority.

  The contract and deposition templates move to V1.x (DEF-05, DEF-06).
- **DEC-41 Audience and length presets:** For example *One paragraph*, *Detailed digest* or *Plain English for the
  client*.
- **DEC-42 Coverage report:** Every upload and summary says what was actually read, e.g. "212 of 214 pages processed;
  pages 37 and 88 unreadable", plus OCR confidence for scanned pages. Summaries cover the whole document and never
  silently skip part of it.

### 2.6 Draft: responses for the lawyer to review

- **DEC-43 Draft a response from the matter's documents:** The lawyer picks the document they are responding to,
  such as a demand letter or a letter from opposing counsel. They add supporting documents and explain in a chat
  what the response should say. LegalLens writes a draft in an editor next to the chat.
- **DEC-44 Refine the draft through chat:** The lawyer can type instructions like "Make paragraph 3 firmer" or "Add
  our position on the late-payment claim." Changes apply to the draft, and one section can be regenerated without
  redrafting the whole document.
- **DEC-45 Memos follow the documents-only rule:** Memo structure: To/From/Date/Re → Question Presented → Brief
  Answer → Statement of Facts → Discussion (one IRAC/CREAC block per issue) → Conclusion. Each Rule and Explanation
  step may state law only from opinions, statutes or regulations the lawyer uploaded to the matter, with pinpoint
  cites. Before drafting, LegalLens asks the lawyer to upload the governing authority and shows which issues have
  none. Where an issue has no authority, the block shows `[RULE NEEDED: upload or insert authority for X]`, and the
  Brief Answer says the question can't be answered from the matter's documents. A statement of law with no
  supporting passage is flagged the same way as an untraceable citation.
- **DEC-46 Response letter safeguards:**
  - If the other party has a lawyer, the letter is addressed to that lawyer, as Model Rule 4.2 requires.
  - If the other party has no lawyer, a Model Rule 4.3 reminder appears: don't give that person legal advice.
  - Optional header *Confidential settlement communication: FRE 408 / [state equivalent]*. Off by default; the
    lawyer chooses.
  - Optional reservation-of-rights closing. Off by default; the lawyer chooses.
- **DEC-47 Point-by-point response check:** LegalLens lists every claim or demand in the incoming document and shows
  whether the draft addresses it. If a demand letter makes five claims and the draft answers four, the missing one
  is flagged.
- **DEC-48 No invented facts or authority:** The drafter must never add a case, statute, rule or legal statement
  from the AI model's own knowledge. Where authority is needed, it inserts `[CITE NEEDED: authority for X]`, and
  missing facts become placeholders such as `[EFFECTIVE DATE]`. The citation check may still find an authority
  that doesn't trace to an uploaded document, either because the model slipped or because the lawyer typed it. In
  that case the text is replaced with `[UNVERIFIED: <citation as written>]`. It never stays looking like a normal
  citation.
- **DEC-49 Citation checklist before export:** Lists every authority in the draft with one of these statuses:
  - **Full text uploaded:** the cited passage supports the sentence.
  - **Only mentioned:** cited inside another uploaded document, such as opposing counsel's letter, but its full
    text isn't uploaded. Shown as UNVERIFIED. The other side's citations can be wrong or made up.
  - **Not in any uploaded document:** UNVERIFIED.
  - **Added by the lawyer.**

  Every row also notes: *Later history not checked. Confirm it is still good law in your citator.* Export stays
  blocked until each row is acknowledged.
- **DEC-50 Clean export to Word (.docx):** The exported file is what goes to the other side, so it must be clean:
  - Internal source citations, comments, AI notes and the review watermark are removed.
  - Document properties (author, title, template, custom fields) are cleared.
  - Export is blocked while any `[PLACEHOLDER]`, `[CITE NEEDED]` or `[RULE NEEDED]` remains.

  A separate *working copy with sources* is stamped *PRIVILEGED & CONFIDENTIAL / ATTORNEY WORK PRODUCT / DO NOT
  SEND*. The lawyer signs and sends from Word. LegalLens never sends or files anything.

### 2.7 Review before submitting

- **DEC-51 "AI draft: not reviewed" watermark:** Stays on every draft until the lawyer marks it *Reviewed and
  adopted*. The app records when. This makes review an explicit step that leaves a record.
- **DEC-52 Feedback buttons:** *Wrong citation*, *Missed something*, *Should have said not found* and *Helpful*.
  Feedback is stored in the matter's audit trail. When it reveals a new kind of failure, a de-identified or
  synthetic version is written and added to the test set. **Real client text never goes into the test set.**

### 2.8 Confidentiality, security and compliance

- **DEC-53 Matter-scoped retrieval:** The backend applies a matter filter to *every* search and cache lookup, so
  results are never just hidden in the UI. Automated tests prove that no answer or draft can use another matter's
  documents. This is very hard to add later, so it's built in from Slice 1.
- **DEC-54 Secure sign-in:** Multi-factor login for the lawyer, plus a session timeout.
- **DEC-55 No training on client data, and a "Where your data goes" page:** No client data is used to train any
  model. A plain-language page explains to the lawyer and their clients where data is stored and processed.
- **DEC-56 No document content leaves the system:** Error reporting, analytics and crash logs must not send client
  content to third-party services. An automated test checks that the AI layer makes no outbound network calls
  carrying document data.
- **DEC-57 Encryption:** Data is encrypted in transit and at rest, including backups and logs.
- **DEC-58 Real deletion:** Deleting a document also deletes everything made from it: extracted text, chunks,
  search-index entries, cached answers and backups (on the DEC-13 schedule). In a RAG system, a "deleted" file can
  otherwise live on in the index.
- **DEC-59 Treat uploads as untrusted:**
  - A file-type allowlist.
  - A malware scan that runs on infrastructure you control.
  - Each document is tagged at upload as *from our client* or *from another party*.
  - Hidden content (white-on-white text, metadata, tracked changes, comments) is always detected and neutralized for
    the AI, and never followed as instructions.

  For documents from another party, the lawyer sees only a notice such as "contains tracked changes, comments or
  metadata" and must choose to open it. Some states restrict lawyers from reviewing an opponent's metadata,
  although ABA Formal Opinion 06-442 allows it. Model Rule 4.4(b) also requires promptly notifying the sender about
  material sent by mistake.
- **DEC-60 Client AI-consent record:** Records whether the client gave informed consent to AI use, when, what they
  were told (which tool, what data, the risks), and a link to the signed consent. Running the AI locally reduces the
  risk, but ABA Formal Opinion 512 still discusses when clients must be told or asked, and says a boilerplate
  engagement-letter clause is not informed consent. State bars differ (e.g. Florida Bar Opinion 24-1), so the
  reminders follow the lawyer's licensing state.
- **DEC-61 Backups and tested restore:** Encrypted backups, plus a restore that has actually been tested. Losing a
  client's file is real harm.
- **DEC-62 Incident response plan:** A written plan for what happens if client data is exposed, matching lawyers'
  duties after a data breach (ABA Formal Opinion 483).

### 2.9 AI quality and evaluation

- **DEC-63 Test question set ("golden set") from day one:** 30–50 questions over *public or synthetic* documents,
  each with the expected answer and the passage that supports it, reviewed by a practicing lawyer (until then, see
  DEC-20). Cover these categories:
  - single-document facts
  - defined-term lookups
  - tables and exhibits
  - questions across several documents
  - questions whose correct answer is "not found"
  - questions that need outside law, which should be declined clearly
  - memo requests where no authority is uploaded
  - poor scans
  - documents with hidden injected instructions
  - follow-up questions
  - response drafts that must address every point
  - draft prompts that tempt the model to cite case law
  - exports that must come out clean
- **DEC-64 Release gate:** Run the test set again after every change to prompts, models or retrieval. If scores
  drop, don't ship.
- **DEC-65 Choose the local model by test score:** In the architecture phase, run the candidate self-hosted models
  through a first version of the test set on the target hardware. Pick by citation accuracy, correct "not found"
  answers and speed, not by reputation. Local models are usually smaller than the biggest hosted ones, so measuring
  matters even more here.
- **DEC-66 Citation check as a separate step:** After an answer or draft is generated, check that each cited passage
  exists and supports its sentence. Remove or flag any that fail.
- **DEC-67 Ingestion that understands legal structure:** Handles clause numbers (4.2(b)(iii)), defined terms,
  footnotes, exhibits, Bates numbers and tables.
  - MVP formats: text-based PDF and DOCX, plus OCR for clean typed scans with per-page confidence. Many demand
    letters arrive as scans.
  - Letters that arrived by email: pasted text or .eml/.msg files.
  - OCR of poor scans and handwriting comes in V1.x (DEF-16).

### 2.10 Operations

- **DEC-68 Audit trail:** Records what was uploaded, asked, generated, reviewed and exported, which passages were
  retrieved, and which model and prompt version were used. The trail is append-only, exportable per matter, and
  protected like client content. Client content stays out of ordinary application logs.
- **DEC-69 Replayable tracing:** Any answer can be explained later, when someone asks "why did it say that?"
- **DEC-70 Streaming and background jobs:** Ask streams its answer. Long summaries and drafts run as background jobs
  with a progress bar and a notification when done. Targets are in DEC-14.
- **DEC-71 Hardware planning and compute tracking:** The BRD states the hardware budget (DEC-11) and target document
  sizes (DEC-14). The Technical Architecture doc, written after the model is chosen, states the minimum and
  recommended hardware and the page limits (DEF-02). Compute time is tracked per question and per matter.

### 2.11 Build plan: thin vertical slices

- **DEC-72 Slices:** Each slice touches all three layers and ends with something you can demo. **MVP = Slices 0–5
  complete.**

  | Slice | What works at the end of the slice |
  |---|---|
  | **0** | Upload one PDF → extract its text → ask a question → see an answer from a **locally running model** (no retrieval yet). Any convenient local model works here as a placeholder. The real model is chosen in the architecture phase by running candidates through the test set (DEC-65). Benchmark the DEC-14 targets on the lawyer's computer. |
  | **1** | Retrieval over the document, page citations, click-to-source viewer, first test questions. **From here on, every document belongs to a matter. The backend applies the matter filter to every search and cache lookup, and automated cross-matter leak tests run.** |
  | **2** | Summarize with the *Letter or demand received* template, plus the coverage report. |
  | **3** | Draft a response letter, with chat refinement, the point-by-point check, placeholders, the citation-check step, the citation checklist, the review watermark and *Reviewed and adopted* sign-off, and the clean .docx export. |
  | **4** | Security: multi-factor login and session timeout, encryption, audit log, real deletion, backups with a tested restore, untrusted-upload handling (allowlist, local malware scan, hidden-content detection, document origin tags) with injection traps in the test set, the client AI-consent record, a written incident response plan, cross-matter leak tests extended to every feature, and a test that proves no document data leaves the system. |
  | **5** | MVP completion: the memo draft type, the remaining summary templates and audience presets, the *All documents in this matter* scope, the full matter profile and chat history, close/export/delete matter, OCR for clean typed scans, feedback buttons, and the release gate wired to the test set. |

- **DEC-73 No real client documents until Slice 4 is finished.**

### 2.12 Integration: one app from two halves

Decided 2026-10-10 when the frontend was connected to the backend (`INTEGRATION_TODO.md` §4 has the detail).

- **DEC-74 The server's checks are the authority.** The citation checklist lists legal authorities only (cases,
  statutes, rules, regulations); a contract clause a draft quotes is evidence, not authority (DEC-49). The export
  gate also blocks on a claim in the incoming letter that is neither answered nor set aside (DEC-47, RISK-06).
  The browser shows what the server computes and never decides it.
- **DEC-75 A rewrite is a preview.** A section rewrite or a claim response is shown first and saved only when the
  lawyer accepts it; a chat instruction still saves a version straight away, with the diff shown (DEC-44).
  A draft can be started from the Start-draft dialog as well as from a chat turn.
- **DEC-76 Exports are built by the server.** Summary and draft exports are .docx files made on the backend
  (DEC-12, DEC-50); the browser only saves them. The API's wire types are generated from `openapi.json`.
- **DEC-77 One origin.** In development, Vite proxies `/api` to the backend; shipped, FastAPI serves the built app
  itself, so the session cookie is SameSite=Strict with no CORS and `legallens serve --worker` is the whole app.
- **DEC-78 A stand-in engine is labelled.** While the AI engine is the stub, the top bar says "Stand-in answers",
  so a real-looking answer is never mistaken for a model's (DEC-37, RISK-01).


### 2.13 Build decisions, 2026-10-05 to 2026-10-14

Recorded at closeout (`CLOSEOUT_TODO.md`); the evidence is in `GATE_BENCHMARK.md`, `GOLDEN_SET.md`,
`MODEL_COMPARISON.md` and `test-evidence/`.

- **DEC-79 SQLite is the only datastore.** FTS5 keyword search, sqlite-vec vectors and reciprocal rank fusion in
  one file, so one filter by `matter_id` covers every search (DEC-53). Decided 2026-10-05.
- **DEC-80 The orchestrator is hand-written.** Plain async Python over an Ollama HTTP client; no LangChain or other
  LLM framework (reverses the 2026-10-05 choice of LangChain). The pipeline is small and fixed and has a custom
  citation checker, so a framework would add a layer and remove no code. Decided 2026-10-14.
- **DEC-81 All AI runs on the lawyer's computer.** No cloud model: bge-m3 and bge-reranker-v2-m3 in-process,
  qwen2.5:14b-instruct (answer, summary, draft) and llama3.2:3b (rewrite) through Ollama. The model choice is
  provisional until a larger golden set exists (DEF-01). Decided 2026-10-13/14.
- **DEC-82 Backend toolchain.** Python 3.13, Docling with the Tesseract CLI for layout and OCR, ClamAV for the
  malware scan, a `jobs` table for the queue, and data in the OS app-data folder (never the synced project folder).
  Decided 2026-10-06/07.
- **DEC-83 The "Not found" gate uses the reranker score.** Pass at 0.30, or at 0.05 when the keyword share is also
  0.60 or more (`GATE_BENCHMARK.md`); without the reranker, the keyword share alone. Decided 2026-10-14.
- **DEC-84 Ask streams as written, then the checked text replaces it.** An `answer_text` event carries the
  corrected text (renumbered citations, unsupported parts removed); an empty one clears a refused answer before the
  quoted passages follow. Decided 2026-10-14.
- **DEC-85 Routing and checking stay simple.** The router uses the prompt-bar mode and keywords; there is no LLM
  intent router, no query analysis and no NLI verifier. The golden set shows no invented answers and the same
  correctness as a larger model with rule-based checks (quote literal, figures in the passage, claim shares words).
  Revisit if the golden set shows paraphrase misses. Decided 2026-10-14 (CL-2.6).
- **DEC-86 Sign-in is real in production.** argon2id passwords, TOTP with one step of drift, lockout after five
  failures for 15 minutes, and an `X-LegalLens-Request` header on every write (DEC-54 built). Dev mode remains for
  development only and is refused when `env=prod`.
- **DEC-87 Data at rest is encrypted.** SQLCipher 4 (AES-256) for the database, AES-256-GCM for stored files, keys
  from `db.key` or `LEGALLENS_DB_KEY`; a backup is one file without the key, and `backup verify` is the restore
  test (DEC-57, DEC-61).
- **DEC-89 Long documents are summarized by the faster model.** Past 20 pages the summary job uses
  qwen2.5:7b-instruct: a 50-page letter took 598 s on the 14B and 204 s on the 7B (DEC-14 allows 300 s). The
  14B stays the default for shorter documents. Decided 2026-10-14.
- **DEC-90 Ask uses the 7B.** qwen2.5:7b-instruct answers questions: it matched the 14B on the golden set (23/24
  correct, 10/10 not found, 0 invented) at about a third of the time, which brings the full answer inside DEC-14's
  30 s. Summaries and drafts keep the 14B for quality (long documents use the 7B, DEC-89). Decided 2026-10-15.
- **DEC-91 Hardening items built.** `legallens serve --https` makes a self-signed certificate for 127.0.0.1 on this
  computer (`cert trust` prints the one-time command) and marks the session cookie secure; `backup prune` deletes
  backups older than 35 days and keeps the newest (FR-MAT-02); `legallens feedback export` turns feedback into
  candidate golden-set cases for a person to review; `scripts/release_gate.sh` runs the suites and the golden set and
  compares with `golden_baseline.json`, failing on any drop or any invented answer (NFR-06); `INCIDENT_PLAN.md`
  covers lost computer, lost key, data exposure, an infected upload and a wrong answer. Decided 2026-10-15.
- **DEC-92 The memo's Statement of Facts is model-written.** The model narrates the facts from the first passages
  of the incoming document under the same checks as a letter paragraph (literal quotes, figures in the passages, no
  authority); on any failure the quoted passages stand in. Question, Brief Answer, Rule and Application stay the
  lawyer's: law comes only from uploaded authority (DEC-45). Decided 2026-10-15.
- **DEC-88 Drafts take facts from the client's own documents.** When none are named and the whole matter is in
  scope, supporting documents default to the client's documents; the draft type is fixed only by Draft mode, so
  "a memo" in plain words gives a memo. Found by the UAT run, 2026-10-14.
---

## 3. Suggested (SUG)

- **SUG-01 Design the AI layer as separate steps:** For example ingest → retrieve → answer with citations → check
  citations → summarize → draft. Give each step a clear input and output. Later, the multi-agent upgrade (DEF-25)
  becomes "coordinate these steps differently" instead of a rewrite.
- **SUG-02 Anti-persona:** Members of the public looking for legal advice are not users. Excluding them avoids
  unauthorized-practice-of-law risk (RISK-17). In-app disclaimers say LegalLens is for the licensed lawyer.
- **SUG-03 Key user journeys:**
  1. **Ask:** Open or create a matter → upload documents → ask a question → click a citation → check the passage →
     save the answer.
  2. **Summarize:** Open or create a matter → upload a document → pick the template and audience → read the
     structured summary and coverage report → export.
  3. **Draft a response:** Open the matter → upload the letter you need to answer → LegalLens summarizes each claim
     → explain in the chat what the response should say → review the draft, the point-by-point check and the
     citation checklist → resolve placeholders and flags → mark it reviewed → export the clean .docx → sign and
     send it yourself.
- **SUG-04 Quality KPIs:**
  - Citation accuracy: % of citations that exist and support the claim (e.g. ≥ 95% on the test set).
  - Model-introduced authority in drafts, meaning authority that came from neither an uploaded document nor the
    lawyer: target **0**, whether flagged or not.
  - Correct "not found" rate: unanswerable questions, including outside-law questions, correctly declined, without
    declining answerable ones.
  - Response coverage: % of points in an incoming document that the draft addresses or flags.
  - Summary coverage: % of key items captured correctly.
  - Exported files containing internal source references, comments or identifying metadata: target **0**.
  - Leaks between matters in automated tests: target **0**.
- **SUG-05 Value KPIs:** Time saved compared with doing the task by hand (e.g. summarizing a 50-page document, or
  drafting a reply to a demand letter). Draft retention: the share of generated text the lawyer keeps. Time to
  first answer after upload.
- **SUG-06 Usage KPIs:** Tasks per week, matters active per week, export rate.
- **SUG-07 Non-functional requirement areas:** Accuracy and verifiability · Confidentiality and data use · Matter
  isolation and access control · Security · Privacy, retention and deletion · Backup and recovery · Auditability ·
  Performance (response time per feature) · Hardware budget and compute · Availability · Data location
  (infrastructure you control; no outside AI) · Accessibility (WCAG 2.1 AA) · Transparency (model and version
  shown for each output) · Maintainability (vendor-neutral AI layer, swappable models).
- **SUG-08 Development data:** Public or synthetic documents only, for example published court opinions, contracts
  filed publicly with the SEC (EDGAR exhibits), the CUAD contract dataset (contracts labeled by clause type), and
  made-up demand letters.

---

## 4. Open (OPEN)

- **OPEN-01 Lawyer advisor:** No practicing lawyer has been identified yet to write and review the test set and sign
  off on acceptance. The release gate depends on it. Interim: DEC-20. *(Old §13 Q8.)*
- **OPEN-02 First real user:** Practice area and licensing state(s) are unknown. Working assumption: general civil
  litigation, with state rules configurable (DEC-19). *(Old §13 Q2.)*
- **OPEN-03 Citation style:** Should Bluebook formatting come in V1.x, and do the user's state courts require their
  own citation style? It is out of the MVP either way (DEC-12). *(Old §13 Q6, second half.)*

---

## 5. Deferred (DEF)

### 5.1 Decided in a later document

- **DEF-01 Model stack → Technical Architecture doc:** The LLM, embedding model, vector database and RAG variant.
  Whatever is chosen must run self-hosted (DEC-08) and is picked by test score (DEC-65).
- **DEF-02 Hardware spec → Technical Architecture doc:** Minimum and recommended hardware and page limits, within the
  DEC-11 budget.

### 5.2 V1.x

- **DEF-03 Evidence strength instead of fake confidence scores:** Shows how many passages support the answer and flags
  conflicts, such as two termination clauses that disagree.
- **DEF-04 Per-document comparison table:** For example, "Which of these 5 leases allow assignment without consent?"
  The answer is a table with one cited row per document. Documents with nothing relevant are listed as "no relevant
  provision found."
- **DEF-05 Contract summary template:** Parties, term, payment, termination, indemnity, limitation of liability,
  assignment and change of control, governing law, and which checklist clauses were *not* found. Can also show
  clauses that differ from the lawyer's own uploaded template.
- **DEF-06 Deposition summary template:** Digest by topic, key admissions and objections, with page:line cites.
- **DEF-07 Chronologies:** An editable timeline of facts built from all the matter's documents (date, event, people,
  source, disputed?).
- **DEF-08 Key dates and obligations table:** Renewal windows, notice periods, payment dates and response deadlines,
  each linked to its source. These are suggestions for the lawyer to check and are never written straight into a
  calendar.
- **DEF-09 Clause extraction and comparison:** Pull the same clause from many contracts into one table, or compare v2
  and v3 of an agreement.
- **DEF-10 Court response types:** An answer to a complaint, responses to discovery requests (one response per
  numbered interrogatory or request), and an opposition to a motion. These must follow the Federal Rules of Civil
  Procedure or state rules, with strict deadlines and court formatting. Those rules come from curated, versioned
  rule templates, never from the model's own knowledge.
- **DEF-11 Your own templates and past work:** The lawyer uploads their own letters and memos so drafts match their
  style and preferred wording.
- **DEF-12 Tracked changes:** AI edits appear as Word tracked changes, so the lawyer sees exactly what changed.
- **DEF-13 AI-use disclosure helper:** Some federal and state judges require lawyers to certify how they used AI in a
  filing. This feature generates that text from the audit log.
- **DEF-14 Sensitive-data detection and redaction check:** Finds Social Security and taxpayer-ID numbers,
  financial-account numbers, birth dates and minors' names. Checks drafts against the redaction rule for the
  matter's court:
  - Fed. R. Civ. P. 5.2 for federal civil cases
  - Fed. R. Crim. P. 49.1 for federal criminal cases
  - Fed. R. Bankr. P. 9037 for bankruptcy
  - the state's own rule for state courts
- **DEF-15 Retention schedules and legal hold:** Closing a matter starts a retention clock. A legal hold stops deletion
  for that matter.
- **DEF-16 OCR of poor scans and handwriting.**
- **DEF-17 Document versions:** Recognizes a new version of a document, ties each citation to the exact version, and
  answers "what changed between v2 and v3?"
- **DEF-18 Usage report per matter:** Supports honest billing. ABA Formal Opinion 512 says lawyers who bill by the
  hour can charge only for time actually spent.
- **DEF-19 PDF export.**

### 5.3 Future

- **DEF-20 Multi-person review workflow:** Paralegal → associate → partner review, needed only if LegalLens adds team
  accounts.
- **DEF-21 Team accounts, roles and ethical walls:** Only if LegalLens grows beyond one lawyer. Later personas:
  assistant or paralegal, associate, partner, in-house counsel, firm admin.
- **DEF-22 Enterprise baseline:** Single sign-on, SOC 2 Type II, choice of data region, customer-managed keys. Only if
  LegalLens is sold to firms.
- **DEF-23 Optional outside AI provider:** Only if DEC-08 changes, and only with contractual no-training and
  zero-retention terms, the client's informed consent, and a per-matter setting.
- **DEF-24 Privilege detection in documents received from the other side.**
- **DEF-25 Multi-agent upgrade path:** Possible agents once the RAG version is stable:
  - **Drafting agent:** drafts section by section from the lawyer's templates.
  - **Response-mapping agent:** pairs each point in an incoming document with the reply that answers it.
  - **Citation-checker agent:** independently confirms each citation against its source.
  - **Reviewer agent:** checks drafts against the matter's facts and documents.
  - **Bulk review agent:** runs a checklist across hundreds of documents and returns a grid with a citation in every
    cell.
  - **Research agent:** only if Ask later goes beyond uploaded documents. That needs a licensed case-law source.
- **DEF-26 Bar-license check at sign-up, and terms of service:** Only if LegalLens is offered to other lawyers.
- **DEF-27 Court-specific formatting across federal courts and 50 states** (local rules, pleading paper).
- **DEF-28 Checking whether a case is still good law:** Needs a licensed citator.
- **DEF-29 Integrations:** Email, document management systems, billing, e-filing.
- **DEF-30 Conflict checking.**
- **DEF-31 Languages other than English** *(assumed 2026-10-05, from DEC-04)*.

---

## 6. Risk register (RISK)

| ID | Risk | Mitigation |
|---|---|---|
| **RISK-01** | Invented or misquoted citations end up in a submitted document, leading to sanctions (*Mata v. Avianca*, 2023; *Wadsworth v. Walmart*, 2025). | The drafter never adds authority from the model's own knowledge. Untraceable citations are replaced with `[UNVERIFIED: …]`, and a citation checklist and review sign-off come before export (DEC-48, DEC-49, DEC-51). Target on the test set: **zero** model-introduced authority, flagged or not. |
| **RISK-02** | A draft repeats a wrong, made-up or overruled authority from the other side's letter or from an uploaded opinion. | The checklist marks "only mentioned" authority as UNVERIFIED, and every row says later history wasn't checked and the lawyer should confirm it in their citator (DEC-49). |
| **RISK-03** | The exported draft leaks privileged material or metadata to the other side. | Clean export: no internal source references, comments, AI notes or document properties, and blocked while placeholders remain (DEC-50). An automated test checks every export. |
| **RISK-04** | One client's content appears in another client's answer or draft. | Backend-enforced matter filter on every search and cache from Slice 1; automated leak tests (DEC-53). |
| **RISK-05** | LegalLens answers a question that needs outside law as if the documents covered it, including through a memo's Rule section. | Documents-only behavior, a clear "not in your documents" answer, `[RULE NEEDED]` in memos, and test questions for exactly these cases (DEC-38, DEC-45, DEC-63). |
| **RISK-06** | The lawyer trusts a polished draft and submits it without reading it closely. | Review watermark and sign-off, point-by-point check, citation checklist, one-click source verification (DEC-51, DEC-47, DEC-49, DEC-36). |
| **RISK-07** | Prompt injection hidden in a document from the other side, which is exactly the kind of document a response is drafted from. | Treat document text as data, detect and neutralize hidden content, include injection traps in the test set (DEC-25, DEC-59, DEC-63). |
| **RISK-08** | Showing the opponent's hidden metadata leads the lawyer into a state-ethics problem. | Notice only, and the lawyer chooses whether to open it; a reminder about state rules and Model Rule 4.4(b) (DEC-59). |
| **RISK-09** | A summary silently misses pages or a key point, and the lawyer relies on it. | Process the whole document, show a coverage report with OCR confidence, and use template checklists that say "not found" when an item is missing (DEC-42). |
| **RISK-10** | A court draft uses the wrong court's rules or format. | Court response types are V1.x (DEF-10), with rules from curated, versioned templates. Court and jurisdiction are in the matter profile (DEC-30). |
| **RISK-11** | Privilege and confidentiality concerns around AI use. The law is unsettled. *United States v. Heppner* (S.D.N.Y. 2026) held that a defendant's own chats with a consumer AI tool were not privileged or work product, while *Warner v. Gilbarco* (E.D. Mich. 2026) protected a pro se litigant's ChatGPT materials as work product. | AI runs only on the lawyer's own computer (DEC-11), so no outside AI service or hosting provider sees client content. Backups that leave the machine are encrypted under keys the lawyer holds, and any backup provider is named on the *Where your data goes* page (DEC-55). LegalLens is used by or at the direction of the lawyer. Privilege legends on working copies are notice only, because labels don't create protection. |
| **RISK-12** | AI logs become an unprotected copy of privileged data. | Give logs the same encryption, access control and retention rules as the documents (DEC-57, DEC-68). |
| **RISK-13** | Client files are lost, including if the lawyer's computer fails or is stolen. | Encrypted backups with a tested restore; export before delete (DEC-61, DEC-34). |
| **RISK-14** | Local models are less capable than the largest hosted models, so answers or drafts are weaker. | Choose the model by test-set score; keep the MVP scope narrow (documents-only answers, response letters first); keep the model swappable (DEC-65, DEC-18). |
| **RISK-15** | The lawyer's computer is too slow for long documents. | Benchmark in Slice 0 against DEC-14; minimum hardware and page limits in the architecture doc (DEF-02); run long jobs in the background (DEC-70). |
| **RISK-16** | A model's license doesn't allow commercial use, or a self-hosted model stops getting security updates. | Check license terms before choosing a model; plan model updates as routine maintenance, each followed by the test set (DEC-64). |
| **RISK-17** | Unauthorized practice of law if non-lawyers use it. | MVP: a single account for the licensed lawyer who owns the workspace, plus in-app disclaimers (SUG-02). If LegalLens is ever offered to other lawyers: a bar-license check at sign-up and terms of service (DEF-26). |
| **RISK-18** | Quality silently drops when a model or prompt changes. | Pin and log versions; the test set gates every release (DEC-64, DEC-68). |
| **RISK-19** | Assuming RAG prevents hallucination. Research found commercial legal AI tools marketed as RAG-based still hallucinated on roughly 17–33% of queries. | Never claim "hallucination-free". Measure accuracy and report it honestly (SUG-04). |
| **RISK-20** | No lawyer reviews the test set, so the release gate measures the wrong things. | Provisional set from public documents with published answers (DEC-20) until OPEN-01 is resolved. |

---

## 7. Where the old sections went

The open questions from the old §13 were answered on 2026-10-05.

| Old item | Answer | Now |
|---|---|---|
| §13 Q1 Where LegalLens runs | The lawyer's own computer | DEC-11 |
| §13 Q2 Practice area and licensing | No real user yet; assume general civil litigation | DEC-19, OPEN-02 |
| §13 Q3 Matters inside the workspace | Agreed | DEC-09 |
| §13 Q4 What "submitting" means | Letters and memos in the MVP; court responses in V1.x | DEC-10, DEF-10 |
| §13 Q5 Documents | Starting size targets; formats as before | DEC-14, DEC-67 |
| §13 Q6 Outputs | .docx only in the MVP; Bluebook still open | DEC-12, DEF-19, OPEN-03 |
| §13 Q7 Retention | Keep until the lawyer deletes | DEC-13 |
| §13 Q8 Lawyer advisor | Not yet | OPEN-01, DEC-20 |
| §13 Q9 Speed | Starting targets, confirmed in Slice 0 | DEC-14 |
| §13 Q10 Hardware budget | About $0–5k, the lawyer's own computer | DEC-11 |
| §13 Q11 Later scope | Assumed: English only; teams and integrations later | DEC-04, DEF-21, DEF-29, DEF-31 |
| §3 Recommendations | React + TS accepted; thin slices accepted; separate AI steps suggested; one model interface decided | DEC-16, DEC-17, SUG-01, DEC-18 |
| §14 Draft BRD outline | Superseded by the BRD (feature-first structure) | — |

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Matter** | A client case or deal. The unit lawyers use to organize and bill work. |
| **RAG** | Retrieval-augmented generation: find the relevant passages first, then have the AI answer using only them. |
| **Grounded answer** | An answer where every claim is supported by a retrieved source passage. |
| **Self-hosted (local) model** | An AI model that runs on infrastructure you control, so data sent to it never leaves that infrastructure. |
| **Embeddings** | Numeric representations of text used to find relevant passages. Creating them is also an AI step, so it must run locally too. |
| **Pinpoint citation** | A reference to the exact page, paragraph or line, not just the document. |
| **Citator** | A service such as KeyCite or Shepard's that shows whether a case has been reversed, overruled or questioned, i.e. whether it is still "good law". |
| **Demand letter** | A letter, often from the other side's lawyer, demanding payment or action and usually setting a deadline. |
| **Discovery** | The pre-trial process where each side requests documents and answers from the other. |
| **Metadata** | Hidden information inside a file, such as author, edit history, tracked changes and comments. |
| **IRAC / CREAC** | Ways to structure legal analysis: Issue-Rule-Application-Conclusion / Conclusion-Rule-Explanation-Application-Conclusion. |
| **Ethical wall** | A block that stops specific people in a firm from seeing specific matters, usually because of a conflict of interest. |
| **Work product** | Documents prepared in anticipation of litigation or for trial, by or for a party or its representative (including its lawyer). Protection is qualified and can be overcome by substantial need, but a lawyer's mental impressions and legal theories are strongly protected (Fed. R. Civ. P. 26(b)(3); states have their own versions). |
| **Golden set** | A fixed set of test questions with known correct answers, used to measure quality after every change. |
| **Prompt injection** | Hidden instructions inside content (e.g. an uploaded document) that try to hijack the AI. |

---

## 9. Background reading

- [ABA Formal Opinion 512: Generative Artificial Intelligence Tools (July 2024)](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf): how lawyers' duties of competence, confidentiality, communication, meritorious claims and candor toward the court, supervision, and fees apply to AI.
- [Florida Bar Ethics Opinion 24-1 (Jan 2024)](https://www.lawnext.com/wp-content/uploads/2024/01/FL-Bar-Ethics-Op-24-1.pdf): an example of state-level AI guidance, including informed consent before sharing confidential information with third-party AI.
- [ABA Formal Opinion 06-442](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/06-442.pdf): reviewing and using metadata in documents received from the other side. Several states take a stricter view.
- *Mata v. Avianca* (S.D.N.Y. 2023): lawyers were sanctioned $5,000 for filing case citations made up by ChatGPT.
- [*Wadsworth v. Walmart* (D. Wyo. 2025)](https://news.bloomberglaw.com/litigation/morgan-morgan-lawyers-fined-for-hallucinated-ai-citations): 8 of 9 cited cases did not exist. They came from the firm's own in-house AI tool.
- [*United States v. Heppner* (S.D.N.Y. 2026)](https://harvardlawreview.org/blog/2026/03/united-states-v-heppner/) and [*Warner v. Gilbarco* (E.D. Mich. 2026)](https://perkinscoie.com/insights/update/heppner-and-gilbarco-courts-apply-privilege-and-work-product-protection-generative): two decisions issued on the same day that reached different results on AI and privilege/work product.
- [Magesh et al., "Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools" (Stanford RegLab/HAI, 2024)](https://arxiv.org/abs/2405.20362).
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/): prompt injection is risk #1.
