# LegalLens Backend: Plan and To-Do

> **Status:** Built 2026-10-07; all tasks done (§10 has the build notes). Extended 2026-10-10 by integration Phase 1
> (§10.5): 49 endpoints, 129 tests passing · **Planned:** 2026-10-06
> **Scope:** The FastAPI backend only, standalone. It is not connected to the frontend yet, and the LangChain
> orchestration is not built. A **stub orchestrator** sits behind the same interface, so every endpoint works end to
> end today.
> **Sources:** the [Technical Architecture](architecture/LegalLens_Technical_Architecture_v0.1.md) (frames 1–7 and
> the API reference), the [BRD](https://claude.ai/code/artifact/22d52891-447c-45a0-a145-ab2cd51408e3) and
> [IDEAS.md](IDEAS.md). DEC, SUG, DEF and RISK IDs refer to IDEAS.md.

**How this file works:** each task has an ID (`BE-3.4`) and a checkbox. Phases run in order, and each one ends with a
demo you can run from Swagger UI or `curl`. Nothing is built until you approve this plan. After approval, Phase 0
creates the folder and file skeleton, and the later phases fill it in.

---

## 1. Decisions made on 2026-10-06

You answered three scoping questions before this plan was written:

| Question | Your answer | What it means in this plan |
| --- | --- | --- |
| What do AI endpoints do without orchestration? | **Stub orchestrator** | One `Orchestrator` interface. The stub runs the real hybrid search over the matter, streams a templated answer with real citations, and emits the real SSE events in the real order. Summary and draft jobs produce placeholder content with real progress, checks and exports. LangChain later replaces one class. |
| How much ingestion? | **Full pipeline** | Real byte sniffing, ClamAV, hidden-content detection, Docling layout, Tesseract OCR, legal structure, chunking and FTS5/sqlite-vec indexing. Only the **embedding model** stays a stand-in (DEF-01 picks it in Slice 0). |
| Security now? | **Dev auth bypass** | Sign-in keeps the real two-step contract (password, then a 6-digit code), but dev mode accepts any password and any code. Sessions, cookies, idle timeout, matter scoping and the hash-chained audit log are real. Password hashing, TOTP, CSRF and encryption at rest come later. |

> **Warning (DEC-73):** with no encryption at rest yet, use **synthetic or public documents only** (SUG-08).
> No real client documents until the security work (Slice 4) is finished.

---

## 2. What is real now, what is stubbed, what comes later

| Capability | Built now | Stubbed now | Later (not in this plan) |
| --- | --- | --- | --- |
| Sign-in and sessions | Sessions, HttpOnly cookie, idle timeout, MFA step in the contract | Any password and any 6-digit code are accepted | argon2id, TOTP enrolment, lockout, CSRF header (DEC-54) |
| Matter isolation | `matter_id` guard on every query; leak tests (DEC-53) | — | — |
| Uploads | Allowlist by bytes, size and page limits, SHA-256 duplicates, ClamAV, quarantine | — | Encrypted file store (DEC-57) |
| Ingestion | Docling + Tesseract OCR, hidden content, email split, legal structure, chunks, coverage | — | Poor scans and handwriting (DEF-16) |
| Embeddings | `Embedder` interface; optional Ollama embedder | Deterministic hashing embedder (default) | Model chosen by golden-set score (DEF-01) |
| Search | FTS5 + sqlite-vec + RRF, parent and neighbour expansion | — | Cross-encoder reranker (orchestration) |
| Chat turn | REST + SSE, idempotency, replay, cancel, persistence, citations, traces | Router, answer text and verification (stub) | LangChain orchestrator over Ollama |
| Summaries | Templates, job flow, coverage, persistence | Section content = best passages per field | LLM map-reduce |
| Drafts | Versions, placeholders, authority detection, checks, review, clean .docx export | Draft text = template letter with placeholders | LLM drafting, output guard |
| Audit | Append-only, hash-chained, exportable | — | — |
| Data at rest | SQLite in WAL mode, plain files under `backend/var/` | — | SQLCipher, keychain key, encrypted backups + restore test (DEC-57, DEC-61) |

---

## 3. Backend architecture

### 3.1 Processes

| Process | Command | Does |
| --- | --- | --- |
| API | `uv run legallens serve` | FastAPI on `127.0.0.1:8000` only (DEC-08). Runs chat turns (stub orchestrator) as asyncio tasks. |
| Worker | `uv run legallens worker` | Claims rows from `jobs`: ingest, summarize, draft, regenerate, export. One job at a time (Docling is heavy). |
| Both, for development | `uv run legallens dev` | API + an in-process worker thread, with auto-reload. |
| ClamAV | `clamd` (Homebrew service) | Scans each upload over a local Unix socket. |
| Ollama (optional) | `ollama serve` | Only if `LEGALLENS_EMBEDDER=ollama`. Not needed for this plan. |

### 3.2 Layers inside the API

```
HTTP ─▶ api/v1 routers ─▶ services ─▶ repositories ─▶ db (SQLAlchemy 2, SQLite + FTS5 + sqlite-vec)
           │                 │
           │                 ├─▶ orchestrator (interface)  ◀── StubOrchestrator now, LangChain later
           │                 ├─▶ search (hybrid)           ◀── used by the stub now, by LangChain later
           │                 ├─▶ jobs queue ─▶ worker ─▶ ingestion pipeline · summary · draft · export handlers
           │                 └─▶ audit · events outbox · file store · scanner · embedder
           └─▶ deps: current_user · matter_access · writable_matter · idempotency
```

- **Interfaces with swappable implementations:** `Orchestrator`, `Embedder`, `Scanner`, `Converter`, `FileStore`,
  `Authenticator`. Each is chosen by config, so later work replaces an implementation, not the callers (DEC-18).
- **Sync database, async streams:** routes use sync SQLAlchemy sessions (FastAPI runs them in a thread pool). Only the
  two SSE endpoints and chat runs are async. SQLite is local and fast, so this keeps the code simple.
- **Events between processes:** the worker is a separate process, so it writes events to a `matter_events` table.
  The SSE endpoint tails that table. The row id is the SSE `id`, so `Last-Event-ID` survives a restart.
- **Chat runs start when the message is posted, not when the stream opens.** Events are buffered per run, so a late
  or dropped stream replays from `Last-Event-ID` and loses nothing.

### 3.3 Configuration

Environment variables prefixed `LEGALLENS_`, with defaults in `.env.example`:

- `ENV=dev`, `DATA_DIR` (database, files, quarantine, exports, models). Default: the OS app-data folder, never the
  project folder (§10.1)
- `AUTH_MODE=dev`, `DEV_USER_EMAIL=lawyer@legallens.local`, `SESSION_IDLE_MINUTES=30`, `SESSION_MAX_HOURS=12`
- `SCANNER=clamd|none`, `CLAMD_SOCKET=/opt/homebrew/var/run/clamav/clamd.sock`
- `CONVERTER=docling|fast` (fast = PyMuPDF and python-docx without OCR, for quick tests)
- `EMBEDDER=hash|ollama`, `EMBED_DIM=1024`, `OLLAMA_URL=http://127.0.0.1:11434`
- `ORCHESTRATOR=stub`, `STUB_TOKEN_DELAY_MS=25`
- `MAX_UPLOAD_MB=50`, `MAX_PAGES=300`

### 3.4 Toolchain finding

The Python 3.14 installed on this Mac (python.org build) **cannot load SQLite extensions**: `enable_load_extension`
is missing, so sqlite-vec won't load. The backend uses a **uv-managed Python 3.13** pinned in `.python-version`.
That build supports extensions, and every library here, including Docling and PyTorch, ships wheels for it. Phase 0
starts with a spike to prove this. The fallback is `apsw`, which bundles its own SQLite.

---

## 4. Data model

### 4.1 Tables

The 20 tables in frame 7 are built as drawn: `users`, `sessions`, `matters`, `conversations`, `messages`,
`message_citations`, `retrieval_traces`, `feedback`, `documents`, `pages`, `chunks`, `chunks_fts`, `chunks_vec`,
`defined_terms`, `summaries`, `drafts`, `draft_versions`, `exports`, `jobs` and `audit_log`.

- IDs are prefixed ULIDs (`mat_01J9…`, `doc_…`, `msg_…`). Pages, chunks, citations, feedback, audit rows and events
  use integer keys, as in frame 7.
- `chunks_fts` uses FTS5 with external content (`content='chunks'`), the `porter unicode61` tokenizer, and triggers
  that index child chunks only (parent section rows are skipped).
- `chunks_vec` uses vec0 with partition key `matter_id`, metadata column `document_id`, and `float[EMBED_DIM]`.
- `audit_log` has triggers that abort any UPDATE or DELETE.

### 4.2 Additions to frame 7 (please confirm)

| Addition | Why |
| --- | --- |
| **`runs`** table: id, matter_id, conversation_id, user/assistant message ids, mode, intent, status, timestamps | A run's owner and status must outlive the stream: scope checks on `/runs/{id}/…`, and recovery after a restart |
| **`matter_events`** table: id (autoincrement), matter_id, type, data_json, created_at | Outbox from the worker process to the SSE stream; durable `Last-Event-ID`; pruned after 7 days |
| `users.name` | Shown in the top bar and on working copies |
| `messages.idempotency_key` (unique per conversation), `status`, `mode`, `outside_law` | Double-click protection; streaming, cancelled and failed states; DEC-38 notice |
| `documents.size_bytes`, `scan_status`, `parent_document_id`, `error_json`, `ready_at` | Upload checks, email attachments as child documents, failure reasons |
| `summaries.matter_id`, `status`, `job_id` | Every table with client data carries `matter_id` (DEC-53) |
| `drafts.supporting_document_ids_json`, `current_version`, `safeguards_json`, `acknowledgments_json` | Checks, safeguards and export gating |
| `exports.matter_id` | Matter filter |
| `jobs.document_id`, `cancel_requested`, `heartbeat_at`, `available_at` | Ingestion link, cancel, stale-job recovery, retry backoff |
| `chunks_vec` metadata column `document_id` | Filters "This document" inside the KNN query instead of over-fetching `k = 200` |

---

## 5. Folder structure

Phase 0 creates this:

```
backend/
├─ pyproject.toml · uv.lock · .python-version · .env.example · alembic.ini · README.md · openapi.json
├─ migrations/                    Alembic env + versions (FTS5, vec0 and triggers in raw SQL)
├─ var/                           runtime data, git-ignored: legallens.db, files/, quarantine/, exports/
├─ src/legallens/
│  ├─ main.py                     app factory: routers, middleware, error handlers
│  ├─ cli.py                      serve · worker · dev · db upgrade|reset · seed · search · audit verify
│  ├─ config.py · logging.py · errors.py · ids.py
│  ├─ db/                         engine (pragmas, sqlite-vec), session, models/, scope guard
│  ├─ repositories/               one per area; every query carries the matter scope
│  ├─ schemas/                    Pydantic models = the API contract (§7)
│  ├─ api/
│  │  ├─ deps.py                  current_user, matter_access, writable_matter, idempotency
│  │  └─ v1/                      auth, matters, conversations, chat, documents, jobs, summaries, drafts, audit, health
│  ├─ services/                   matters, conversations, documents, drafts, exports, deletion, audit, events
│  ├─ streaming/                  SSE helpers, run registry, matter event tailer
│  ├─ jobs/                       queue (claim, heartbeat, retry, cancel), worker loop, handlers/
│  ├─ ingestion/
│  │  ├─ sniff.py                 file type from bytes
│  │  ├─ scanner.py               Scanner protocol; ClamdScanner (INSTREAM); NoopScanner
│  │  ├─ hidden.py                hidden-content detection and sanitized copy (PDF, DOCX)
│  │  ├─ email.py                 EML / MSG split and attachments
│  │  ├─ triage.py                text layer vs image-only, per page
│  │  ├─ convert/                 Converter protocol; DoclingConverter; FastConverter; TextConverter
│  │  ├─ legal.py                 clause numbers, headings, defined terms, Bates, exhibits, footnotes
│  │  ├─ chunker.py · coverage.py
│  │  └─ pipeline.py              ingest(document_id): the steps in frame 6
│  ├─ search/                     FTS query builder, sparse leg, dense leg, RRF, expansion, scope label
│  ├─ models/                     Embedder protocol; HashEmbedder; OllamaEmbedder
│  ├─ orchestrator/
│  │  ├─ base.py                  Orchestrator protocol, RunContext, event types
│  │  └─ stub/                    router, ask, clarify, refine, summarize, draft
│  ├─ drafting/                   templates, placeholders, authority detector, checklist, point-by-point, docx export
│  └─ storage/                    FileStore protocol; LocalFileStore
└─ tests/
   ├─ conftest.py · factories.py · samples/ (synthetic document generator)
   └─ unit/ · api/ · ingestion/ · search/ · streaming/ · security/ · e2e/
```

---

## 6. To-do by phase

Each phase ends with a demo. The BRD slice it supports is in brackets.

### Phase 0: Foundation and skeleton

- [x] **BE-0.1** Create `backend/` with uv: Python 3.13 pinned in `.python-version`, `pyproject.toml`, src layout,
      package `legallens`.
- [x] **BE-0.2** Add and pin the core dependencies: fastapi, uvicorn, pydantic-settings, sqlalchemy, alembic,
      sqlite-vec, sse-starlette, python-multipart, python-ulid, typer, httpx. Docling comes in Phase 4.
- [x] **BE-0.3** Spike (§3.4): load sqlite-vec in uv's Python; create a vec0 table with a partition key and a
      metadata column; run a filtered KNN query; create an FTS5 table. Record the versions. Fall back to `apsw` if it
      fails.
- [x] **BE-0.4** Create the full skeleton from §5. Each file is a typed stub with a one-line docstring.
- [x] **BE-0.5** Config, JSON logging with request IDs and a filter that keeps client text out of logs, problem+json
      error handlers, the app factory and `GET /api/v1/health`.
- [x] **BE-0.6** Tooling: ruff, mypy, pytest with coverage. CLI commands `serve`, `worker` and `dev`. A README with
      run steps.

**Demo:** `uv run legallens serve`, open http://127.0.0.1:8000/docs, health returns OK, and `uv run pytest` passes.

### Phase 1: Data layer

- [x] **BE-1.1** Engine: SQLAlchemy 2 (sync); `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`; sqlite-vec
      loaded on every connection.
- [x] **BE-1.2** ORM models for the 20 tables in frame 7 plus the §4.2 additions.
- [x] **BE-1.3** First Alembic migration, with raw SQL for `chunks_fts` (FTS5 and its triggers), `chunks_vec` (vec0)
      and the append-only triggers on `audit_log`.
- [x] **BE-1.4** Matter-scope guard (DEC-53): a scoped session adds `matter_id = ?` to every ORM query on a
      client-data table, and a query without a scope raises an error. There is an explicit `unscoped()` block for the
      worker's job claim only.
- [x] **BE-1.5** Audit service: hash-chained append (`prev_hash`, `hash`), `verify_chain()`, and a details schema
      with IDs, counts and enums only, never client text (DEC-68).
- [x] **BE-1.6** Pydantic schemas for the whole contract in §7: shared types, `Problem`, `Page[T]` and opaque cursors.
- [x] **BE-1.7** CLI: `db upgrade`, `db reset` (dev only) and `seed`. The seed creates the dev user and the three
      matters from the frontend mock: Smith v. Acme Corp, Rivera lease dispute, and Henderson estate (closed).
- [x] **BE-1.8** Tests: migration up and down, scope-guard refusal, audit-chain tamper detection.

**Demo:** run the migrations and the seed, then open `var/legallens.db` and see the tables, triggers and vec0 table.

### Phase 2: Sessions, dev sign-in and matters [A, B]

- [x] **BE-2.1** Sessions: a random token in an HttpOnly, SameSite=Strict cookie (`ll_session`), stored only as a
      hash. Idle timeout of 30 min, absolute expiry of 12 h, and an `mfa_verified` flag, as in frame 7.
- [x] **BE-2.2** Dev authenticator: login accepts any password for a known email and still returns the MFA step;
      verify accepts any 6 digits. `AUTH_MODE=real` refuses to start until real auth is built. The contract is the same
      in both modes, so the frontend never changes.
- [x] **BE-2.3** Auth endpoints: `login`, `mfa/verify`, `logout`, `me`. Plus a dev-only `POST /auth/dev-session` that
      signs in with one call from Swagger or curl.
- [x] **BE-2.4** Dependencies: `current_user`; `matter_access` (404 if missing, 403 if not the owner);
      `writable_matter` (409 `matter_closed`).
- [x] **BE-2.5** Matters endpoints: list, create, get, patch (profile and AI consent), close. The matter includes
      counts and compute totals (DEC-71).
- [x] **BE-2.6** Audit rows for login, logout, and creating, editing and closing a matter.
- [x] **BE-2.7** Tests: the sign-in flow, session expiry, 401, 403, 404 and 409, and a closed matter being read-only.

**Demo:** in Swagger, sign in, create a matter, edit its profile, close another matter and see writes refused.

### Phase 3: Documents, jobs and the matter event stream [E, F]

- [x] **BE-3.1** Upload endpoint:
    - streamed multipart, with the 50 MB cap enforced while reading
    - type checked by bytes against the allowlist: PDF, DOCX, EML, MSG, TXT
    - PDFs limited to 300 pages
    - SHA-256 duplicate check within the matter
    - an origin tag is required: `client` or `other_party` (DEC-59)
- [x] **BE-3.2** ClamAV:
    - `brew install clamav`, then download the virus definitions with `freshclam` (about 300 MB; no client data
      leaves the machine)
    - run `clamd` as a Homebrew service
    - a small INSTREAM client over the Unix socket
    - an infected file goes to `var/quarantine/`, the document is marked quarantined, and the upload returns 422
      `malware_detected`
    - if clamd is unreachable the upload fails closed with 503, unless `SCANNER=none` in dev
- [x] **BE-3.3** `FileStore` interface and a local store at `var/files/{matter_id}/{document_id}.{ext}`. The encrypted
      store plugs in later behind the same interface.
- [x] **BE-3.4** Job queue on the `jobs` table:
    - claim one job with a single `UPDATE … RETURNING`
    - up to 3 attempts with backoff
    - heartbeat, and recovery of stale jobs at start-up
    - a cancel flag that handlers check between steps
- [x] **BE-3.5** The worker process, plus the in-process worker used by `legallens dev` and the tests. The worker's
      heartbeat shows in `/health`.
- [x] **BE-3.6** Matter events: the API and the worker write to `matter_events`. `GET /matters/{id}/events` tails the
      table over SSE, with `Last-Event-ID` replay and a 15 s ping.
- [x] **BE-3.7** Endpoints: list documents, get a document, get its file (Range requests), delete it (with a
      `?dry_run=true` preview of what will be removed), get a job, cancel a job.
- [x] **BE-3.8** Tests: every rejection reason, duplicates, EICAR quarantine (needs clamd), Range requests, job retry
      and recovery, event replay.

**Demo:** upload a PDF and watch `job.progress` and `document.ready` arrive on the event stream. The ingest handler is
a placeholder until Phase 4.

### Phase 4: Ingestion pipeline [Slices 1, 4, 5]

- [x] **BE-4.1** Install Docling (it brings in PyTorch, about 2–3 GB) and download its layout and TableFormer models
      once. Ingestion then runs with `HF_HUB_OFFLINE=1`, so it never calls out (DEC-56). Tesseract, already installed
      at `/opt/homebrew/bin`, is the OCR engine.
- [x] **BE-4.2** Pipeline runner: named steps with progress ("Checking file", "Reading pages 34 of 120", "OCR",
      "Indexing"). A failure marks the document failed with a reason the lawyer can act on.
- [x] **BE-4.3** Hidden content (DEC-59):
    - DOCX: tracked changes, comments, hidden or white text, document properties
    - PDF: white or invisible text, tiny text, annotations, embedded files, metadata
    - record the kinds and counts, then convert a **sanitized copy**; the original file is never changed
- [x] **BE-4.4** Email: split EML and MSG into headers and body. *(EML tested; MSG parsing is written but untested, as
      there is no synthetic .msg generator.)* Each attachment becomes a child document with the same
      origin, and goes back through validation and the malware scan.
- [x] **BE-4.5** PDF page triage with PyMuPDF: a text layer or an image-only page, recorded per page.
- [x] **BE-4.6** Docling conversion for PDF and DOCX:
    - Tesseract OCR on image pages; table structure on
    - each item mapped to a block with its page box (top-left origin, PDF points) and its reading order
    - per-page OCR confidence. This needs a spike: use Docling's confidence report if it has per-page scores,
      otherwise take Tesseract's word confidences
    - TXT files and email bodies use a plain text converter
- [x] **BE-4.7** A fast converter (PyMuPDF and python-docx, no OCR), chosen by config, so most tests run in seconds.
- [x] **BE-4.8** Legal structure (DEC-67):
    - clause numbers such as `4.2(b)(iii)`
    - Article, Section, Schedule and Exhibit headings
    - defined terms (`"Effective Date" means …`)
    - footnotes
    - Bates stamps moved out of the body text and into metadata
- [x] **BE-4.9** Chunker:
    - child chunks of 300–500 tokens with 15% overlap, cut on clause boundaries
    - the parent chunk is the whole section
    - a table is never split
    - each chunk carries a header such as "Smith MSA v3 › 4 Termination › 4.2(a)"
- [x] **BE-4.10** `Embedder` interface: `HashEmbedder` (deterministic, the default) and `OllamaEmbedder` (optional),
      with batching.
- [x] **BE-4.11** One transaction writes pages, chunks (FTS5 through the triggers), vectors and defined terms. Then
      the coverage report (DEC-42), and a `document.ready` or `document.failed` event.
- [x] **BE-4.12** New endpoints: `GET /documents/{id}/pages` (text blocks with boxes, used by the viewer for DOCX,
      email and TXT) and `GET /documents/{id}/hidden-content` (a deliberate, audited step).
- [x] **BE-4.13** Synthetic sample set generator (SUG-08). `legallens seed --with-documents` ingests it:
    - a digital MSA PDF with numbered clauses, defined terms and a table
    - a scanned demand letter (image-only PDF)
    - an exhibit that is digital apart from one faxed page
    - a DOCX from the other side with tracked changes and a hidden injected instruction
    - an EML with a PDF attachment
- [x] **BE-4.14** Tests: each format, the OCR page, hidden-content stripping (the injected instruction never reaches
      a chunk), coverage numbers, re-ingesting the same document.

**Demo:** ingest the sample set and read each coverage report (for example "3 of 3 pages read; p. 2 OCR 0.91"). The
hidden instruction appears in the notice but in no chunk.

### Phase 5: Hybrid search [Slice 1]

- [x] **BE-5.1** FTS5 query builder: safe quoting, clause references as phrases (`4.2(b)(iii)` → `"4 2 b iii"`),
      defined terms as phrases.
- [x] **BE-5.2** Sparse leg (BM25, top 40) and dense leg (vec0 KNN, k = 40, partition `matter_id`, `document_id`
      filter for "This document").
- [x] **BE-5.3** Reciprocal rank fusion (k = 60) down to the top 50. Then expansion with the parent section,
      neighbouring chunks and the definitions of defined terms in the passage.
- [x] **BE-5.4** Scope resolver: checks that document IDs belong to the matter and are ready, and builds the
      "Searching: Smith MSA v3 + Exhibits A–B" label (DEC-35).
- [x] **BE-5.5** `legallens search "<question>" --matter <id>`, which prints both legs and the fused ranks.
- [x] **BE-5.6** Cross-matter leak tests (DEC-53, RISK-04): two matters with near-identical documents and different
      secret values. No search for one matter ever returns the other's chunks.

**Demo:** `legallens search "notice to terminate"` returns clause 4.2(a) first, with its rank in each leg.

### Phase 6: Chat history, chat turns and SSE [C, D]

- [x] **BE-6.1** Conversation endpoints:
    - list: pinned first, then newest; title search; cursor pagination
    - create, rename or pin, delete
    - list messages, with a `before` cursor
- [x] **BE-6.2** `Orchestrator` interface (`run(ctx) → async iterator of events`) and the event types from the API
      reference. LangChain implements the same interface later.
- [x] **BE-6.3** Run registry:
    - a run starts when the message is posted
    - each event is buffered with a sequence `id`
    - a stream replays from `Last-Event-ID`, then follows live
    - cancel
    - runs interrupted by a restart are marked failed
- [x] **BE-6.4** `POST /conversations/{id}/messages`:
    - `Idempotency-Key`: the same key replays the first response; a different body with the same key returns 409
    - one active run per conversation
    - scope validation
    - an `ask` audit row
- [x] **BE-6.5** `GET /runs/{id}/stream` (15 s ping; a finished run whose buffer has expired sends one `done` built
      from the stored message) and `POST /runs/{id}/cancel` (ends with `done {cancelled: true}`).
- [x] **BE-6.6** Stub orchestrator:
    - **Router:** uses the mode if one is set. Otherwise it goes by keywords ("summarize…", "draft", "reply",
      "respond"), and anything else is Ask. It sends a turn to Clarify when the message is too short or names a
      document that isn't in the matter.
    - **Ask:** hybrid search, then a gate (no keyword hit means "Not found in your documents"), then a templated
      answer that quotes the top passages with `[n]`, streamed word by word. Each quote is checked against its chunk,
      then the `citation` and `answer_state` events follow.
    - **Outside-law questions** ("enforceable", "under California law"): partial, with the DEC-38 notice.
    - **Summarize and Draft:** queue the job and emit `job`.
    - **Refine:** with a `draft_id`, saves a new version of one section and streams a short confirmation.
- [x] **BE-6.7** Save the assistant message, citations, retrieval trace, model and prompt version (`stub-0`), tokens
      and latency. Give a new chat a title from its first question, and emit `conversation.updated`.
- [x] **BE-6.8** `GET /citations/{id}` (page, box and quote for the highlight) and `POST /messages/{id}/feedback`
      (DEC-52).
- [x] **BE-6.9** Tests: event order for each path, replay after a dropped connection, cancel mid-stream,
      idempotency, not found, and a leak test through the chat.

**Demo:** `curl -N` a full turn and see the status steps, tokens, citations, `answer_state` and `done`. Then reconnect
with `Last-Event-ID: 5` and see the rest replayed.

### Phase 7: Summaries [F, Slice 2]

- [x] **BE-7.1** Template definitions for letter or demand, pleading and court opinion, plus the three audience
      presets (DEC-40, DEC-41).
- [x] **BE-7.2** `POST /documents/{id}/summaries` queues a summary job. The stub reads the whole document in order.
      For each template field it uses the best passages from that document with citations, or "Not found in this
      document". Coverage is attached (DEC-42).
- [x] **BE-7.3** `GET /summaries/{id}`, with progress per field on the event stream.
- [x] **BE-7.4** Tests: every field is present, missing fields are marked, and coverage matches the document.

**Demo:** summarize the demand letter and read its sections and coverage report.

### Phase 8: Drafts, checks, export and deletion [G, B, Slice 3]

- [x] **BE-8.1** Draft job, started from a chat turn in Draft mode. The stub:
    - pulls the claims out of the incoming document (numbered demands, and sentences with "demand" or "claim")
    - writes one section per claim
    - picks the addressee from the matter profile: opposing counsel under Rule 4.2, or the party with a Rule 4.3
      reminder (DEC-46)
    - inserts `[CITE NEEDED: …]` and fact placeholders such as `[EFFECTIVE DATE]` (DEC-48)
- [x] **BE-8.2** Versions:
    - every change saves a `draft_versions` row
    - PATCH takes a `base_version` and returns 409 on a conflict
    - an older version can be restored
    - editing an adopted draft returns it to "not reviewed"
- [x] **BE-8.3** Placeholder scanner and authority detector (cases, statutes, rules, regulations). Both are
      deterministic and real, and the LangChain drafter reuses them later.
- [x] **BE-8.4** Checks:
    - point by point: each claim marked addressed or missing (DEC-47)
    - citation checklist: the four statuses, each row with the "Later history not checked" note (DEC-49)
    - acknowledgments are sent through PATCH
- [x] **BE-8.5** Regenerate one section: a job whose stub rewrite saves a new version with a diff (DEC-44).
- [x] **BE-8.6** Review: "Reviewed and adopted", with the time recorded (DEC-51).
- [x] **BE-8.7** Export (DEC-50):
    - **clean .docx:** no sources, comments, watermark or document properties. Blocked while any placeholder, any
      unacknowledged checklist row or a missing review remains. Each file is re-opened and checked before it is
      returned
    - **working copy:** stamped "PRIVILEGED & CONFIDENTIAL / ATTORNEY WORK PRODUCT / DO NOT SEND"
    - an `exports` row and an audit row for each
- [x] **BE-8.8** Matter export job: a .zip with the originals, summaries, drafts (working copies), chat history,
      audit log and a manifest. It is downloaded through the new `GET /jobs/{id}/file` (DEC-33).
- [x] **BE-8.9** Deletion, each in one transaction (DEC-34, DEC-58):
    - delete a matter only after a typed confirmation
    - delete a document with its file, pages, chunks, FTS5 rows, vectors, citations and summaries
    - leave a deletion audit row with no client content
- [x] **BE-8.10** Tests: export gating, a metadata-free clean export (RISK-03), version conflicts, and nothing left
      behind after a delete (row counts, FTS and vector queries, files on disk).

**Demo:** draft a reply to the demand letter, fill the placeholders, acknowledge the checklist, adopt the draft,
export it clean and open it in Word.

### Phase 9: Audit, hardening and handover [H]

- [x] **BE-9.1** `GET /matters/{id}/audit`: filters, cursor, JSONL download and `chain_valid`.
- [x] **BE-9.2** Audit coverage test: every write route leaves exactly one audit row with the right action.
- [x] **BE-9.3** Log hygiene test: a canary string inside a document never appears in the logs (DEC-68, RISK-12).
- [x] **BE-9.4** No-egress test: sockets to anything other than localhost are blocked during ingestion and chat
      (DEC-56).
- [x] **BE-9.5** OpenAPI polish: tags, operation IDs and examples. Commit `openapi.json` with a drift test, ready for
      the frontend's `HttpApiClient`.
- [x] **BE-9.6** Performance smoke test *(results in §10.3)*: ingest 200 synthetic pages, time search at p95 and time to first token
      through the stub.
- [x] **BE-9.7** End-to-end test: sign in → matter → upload → ask → summarize → draft → export → delete.
- [x] **BE-9.8** A README run book, and a list of the changes to carry back into the Technical Architecture doc (the
      §4.2 tables and the §7 new endpoints).

**Demo:** the end-to-end test passes on a fresh checkout.

---

## 7. API contract

Every path sits under `/api/v1`. JSON uses snake_case and timestamps are RFC 3339 in UTC. Routes marked **(new)** are
not in the Technical Architecture's 37; they are proposed in §9.

### 7.1 Shared types

```python
Id        = str                         # prefixed ULID: "mat_01J9…", "doc_…", "msg_…", "run_…", "job_…"
Page[T]   = {items: list[T], next_cursor: str | None}          # opaque cursor
Problem   = {type, title, status, detail, instance, code, errors?: [{loc, msg}], **extra}  # application/problem+json

# Auth
User      = {id, email, name, licensing_states: list[str], created_at, last_login_at}
Me        = {user: User, session: {expires_at, idle_timeout_s}, auth_mode: "dev" | "real",
             app: {version, orchestrator: "stub" | "langchain", embedder, converter, scanner,
                   model_id: str | None, prompt_version: str | None}}

# Matters (DEC-30, DEC-60)
Counsel   = {name, firm?, address?, email?}
Party     = {name, role: "client" | "opposing" | "other", represented: bool, counsel?: Counsel}
AiConsent = {status: "not_recorded" | "given" | "declined", recorded_on?: date,
             told_tool: bool, told_data: bool, told_risks: bool, notes?: str, consent_document_id?: Id}
Matter    = {id, name, client_name, our_side, court?, jurisdiction?, practice_area?,
             profile: {parties: list[Party], court_level?: "federal" | "state", notes?},
             ai_consent: AiConsent, status: "open" | "closed",
             counts: {documents, conversations}, usage: {tokens_in, tokens_out, compute_ms},
             created_at, closed_at?, last_activity_at}
MatterSummary = {id, name, client_name, status, document_count, last_activity_at}
MatterCreate  = {name, client_name, our_side, court?, jurisdiction?, practice_area?, profile?, ai_consent?}

# Chat
Scope     = {kind: "all" | "documents", document_ids: list[Id]}      # "This document" = one id
Mode      = "auto" | "ask" | "summarize" | "draft"
Intent    = "ask" | "summarize" | "draft" | "refine_draft" | "clarify"
Conversation = {id, matter_id, title, pinned, scope: Scope, created_at, updated_at}
Citation  = {id: int, n: int, document_id, document_name, page, para_ref?, quote, verified: bool}
Message   = {id, conversation_id, role: "user" | "assistant", content, status: "complete" | "streaming" | "cancelled" | "failed",
             mode?, intent?, answer_state?: "found" | "partial" | "not_found", outside_law: bool,
             scope_label?, citations: list[Citation], run_id?, job_id?,
             model_id?, prompt_version?, tokens_in?, tokens_out?, latency_ms?, feedback?: FeedbackKind, created_at}
SendMessage = {content: str (1–8000), scope: Scope, mode: Mode = "auto",
               options?: {summary_template?, audience?, draft_type?: "response_letter" | "memo",
                          incoming_document_id?, supporting_document_ids?: list[Id], draft_id?}}
FeedbackKind = "helpful" | "wrong_citation" | "missed_something" | "should_be_not_found"

# Documents
Document  = {id, matter_id, filename, mime, size_bytes, sha256, origin: "client" | "other_party",
             status: "queued" | "processing" | "ready" | "failed" | "quarantined",
             scan_status: "clean" | "infected" | "skipped", pages_total?, pages_processed, ocr_conf_avg?,
             hidden_content?: {kinds: list[HiddenKind], count}, parent_document_id?,
             error?: {code, message}, uploaded_at, ready_at?}
HiddenKind = "tracked_changes" | "comments" | "hidden_text" | "white_text" | "tiny_text" | "metadata"
           | "annotations" | "embedded_files"
Coverage  = {pages_total, pages_read, pages_unreadable: list[int], ocr_pages: list[int],
             low_confidence_pages: list[{page, ocr_conf}], text}    # "212 of 214 pages read; pp. 37 and 88 unreadable"
DocumentDetail = Document + {coverage?: Coverage, chunk_count, defined_term_count, job_id?}
PageBlocks = {page_no, width, height, has_text_layer, ocr_conf?,
              blocks: list[{id, kind, text, bbox: [x0, y0, x1, y1], section_path?}]}
CitationLocation = {id, document_id, document_name, page, para_ref?, quote, bbox, page_width, page_height, verified}
DeletionReport = {document_id, dry_run: bool,
                  removed: {pages, chunks, fts_rows, vectors, citations, defined_terms, summaries, file_bytes}}

# Jobs and summaries
Job       = {id, matter_id, kind: "ingest" | "summarize" | "draft" | "regenerate" | "export",
             status: "queued" | "running" | "done" | "failed" | "cancelled", progress: int (0–100), step?,
             attempts, document_id?, error?: {code, message}, result?: {kind, id, url}, created_at, started_at?, finished_at?}
InlineCitation = {n, chunk_id, document_id, page, para_ref?, quote, bbox?}
Summary   = {id, matter_id, document_id, template: "letter_demand" | "pleading" | "opinion",
             audience: "one_paragraph" | "detailed" | "plain_english", status: "pending" | "ready" | "failed", job_id,
             sections: list[{field, title, found: bool, content, citations: list[InlineCitation]}],
             coverage: Coverage, model_id, prompt_version, created_at}

# Drafts (DEC-43 to DEC-51)
DraftSection = {id, heading, content, citations: list[InlineCitation], origin: "ai" | "lawyer"}
Placeholder  = {token, kind: "placeholder" | "cite_needed" | "rule_needed" | "unverified", section_id, offset}
Safeguards   = {addressee: {name, firm?, address?, rule: "4.2" | "4.3" | None},
                fre408_header: bool = False, reservation_of_rights: bool = False}
Draft     = {id, matter_id, conversation_id?, type: "response_letter" | "memo", incoming_document_id?,
             supporting_document_ids, status: "generating" | "not_reviewed" | "reviewed_adopted", reviewed_at?,
             version, sections: list[DraftSection], placeholders: list[Placeholder], safeguards: Safeguards,
             versions: list[{version, created_at, source: "ai" | "lawyer" | "regenerate" | "restore"}],
             created_at, updated_at}
DraftPatch = {base_version: int, sections?: list[{id, heading?, content}], safeguards?: partial Safeguards,
              acknowledge?: list[checklist_item_id], restore_version?: int}
DraftChecks = {draft_id, version,
               point_by_point: list[{claim_id, claim, source: InlineCitation, status: "addressed" | "missing", section_ids}],
               citation_checklist: list[{id, authority, status: "full_text_uploaded" | "only_mentioned"
                                        | "not_in_documents" | "added_by_lawyer",
                                        supporting?: InlineCitation, acknowledged: bool, note}],
               placeholders: list[Placeholder], export: {clean_allowed: bool, blockers: list[{code, message}]}}

# Audit
AuditEntry = {id: int, ts, user_id, matter_id?, action, entity_type, entity_id, details: dict, prev_hash, hash}
```

### 7.2 Endpoints

```text
A · Auth
POST   /auth/login                 {email, password}         200 {mfa_required: true} + cookie (MFA pending) · 401 invalid_credentials
POST   /auth/mfa/verify            {code}                    200 Me · 401 invalid_code | session_expired
POST   /auth/logout                                          204, cookie cleared
GET    /auth/me                                              200 Me · 401 not_authenticated
POST   /auth/dev-session (new)     {email?}                  200 Me; dev mode only, one step

B · Matters
GET    /matters?status=open|closed|all&cursor=               200 Page[MatterSummary]
POST   /matters                    MatterCreate              201 Matter
GET    /matters/{matter_id}                                  200 Matter
PATCH  /matters/{matter_id}        partial MatterCreate      200 Matter · 409 matter_closed
POST   /matters/{matter_id}/close                            200 Matter (repeating it is a no-op)
POST   /matters/{matter_id}/export                           202 {job_id}; download at /jobs/{job_id}/file
DELETE /matters/{matter_id}?confirm=<matter name>            204 · 422 confirmation_mismatch

C · Chat history
GET    /matters/{matter_id}/conversations?cursor=&q=&limit=30          200 Page[Conversation]
POST   /matters/{matter_id}/conversations      {title?, scope?}        201 Conversation
PATCH  /conversations/{conversation_id}        {title?, pinned?}       200 Conversation
DELETE /conversations/{conversation_id}                                204 (drafts are kept, unlinked)
GET    /conversations/{conversation_id}/messages?before=&limit=50      200 Page[Message], oldest first; cursor goes older

D · Chat
POST   /conversations/{conversation_id}/messages   Idempotency-Key header + SendMessage
                                                   202 {message_id, run_id, stream_url}
                                                   409 run_in_progress | idempotency_conflict | matter_closed
                                                   422 invalid_scope · 428 idempotency_key_required
GET    /runs/{run_id}/stream                       text/event-stream; optional Last-Event-ID header
POST   /runs/{run_id}/cancel                       200 {run_id, status}; no-op if already finished
POST   /messages/{message_id}/feedback             {kind, note?}   200 Feedback; resending replaces it

E · Documents
POST   /matters/{matter_id}/documents              multipart: file, origin=client|other_party
                                                   202 {document_id, job_id, status: "queued"}
                                                   409 duplicate_document {existing_document_id}
                                                   413 file_too_large | too_many_pages · 415 unsupported_type
                                                   422 malware_detected {document_id} · 503 scanner_unavailable
GET    /matters/{matter_id}/documents?status=&cursor=        200 Page[Document]
GET    /documents/{document_id}                              200 DocumentDetail
GET    /documents/{document_id}/file                         200 or 206 original bytes · 409 document_quarantined
GET    /documents/{document_id}/pages?from=1&limit=10 (new)  200 {pages: list[PageBlocks]}
GET    /documents/{document_id}/hidden-content (new)         200 {items: list[{kind, page?, location, text?}]}, audited
GET    /citations/{citation_id}                              200 CitationLocation
DELETE /documents/{document_id}?dry_run=false                200 DeletionReport

F · Summaries and jobs
POST   /documents/{document_id}/summaries   {template, audience}   202 {summary_id, job_id} · 409 document_not_ready
GET    /summaries/{summary_id}                                     200 Summary
GET    /jobs/{job_id}                                              200 Job
POST   /jobs/{job_id}/cancel (new)                                 200 Job · 409 job_not_cancellable
GET    /jobs/{job_id}/file (new)                                   200 file bytes, for export jobs
GET    /matters/{matter_id}/events                                 text/event-stream

G · Drafts (a draft is created by a chat turn in Draft mode)
GET    /drafts/{draft_id}?version=                                 200 Draft (current or an older version)
PATCH  /drafts/{draft_id}                    DraftPatch            200 Draft · 409 version_conflict
POST   /drafts/{draft_id}/sections/{section_id}/regenerate   {instruction}   202 {job_id}
GET    /drafts/{draft_id}/checks                                   200 DraftChecks
POST   /drafts/{draft_id}/review             {confirm: true}       200 Draft (reviewed_adopted)
POST   /drafts/{draft_id}/export?kind=clean|working                200 .docx attachment · 409 export_blocked {blockers}

H · Audit
GET    /matters/{matter_id}/audit?cursor=&action=&since=&format=json|jsonl   200 Page[AuditEntry] + {chain_valid}

Ops
GET    /health (new)                       200 {status, db, sqlite_vec, fts5, worker, scanner, embedder, converter, orchestrator}
                                           no sign-in needed; contains no client data
```

### 7.3 SSE events

Event names and data are exactly as in the Technical Architecture. Each event has a sequence `id`, and a `: ping`
comment is sent every 15 s. These are the orders the stub emits:

| Path | Events in order |
| --- | --- |
| Ask, found | `run.started` → `intent` → `scope` → `status` (rewriting → searching → reranking → generating) → `token` × n → `status` (verifying) → `citation` × k → `answer_state` → `done` |
| Ask, not found | … → `status` (generating) → `token` × n ("Not found in your documents" + what was searched) → `answer_state {not_found}` → `done` |
| Summarize or Draft | `run.started` → `intent` → `scope` → `token` × n (a short acknowledgement) → `job {job_id, kind}` → `done` |
| Clarify | `run.started` → `intent {clarify}` → `token` × n → `done` |
| Cancelled | … → `done {cancelled: true}` |
| Failed | … → `error {code, message}`, then the stream closes |

The matter stream sends `job.progress` (with `document_id` for ingest jobs), `job.done`, `job.failed` (a cancel is
`error.code = "cancelled"`), `document.ready`, `document.failed` and `conversation.updated`.

### 7.4 Error codes

| Status | Codes |
| --- | --- |
| 401 | `not_authenticated`, `session_expired`, `invalid_credentials`, `invalid_code` |
| 403 | `forbidden_matter` |
| 404 | `not_found` |
| 409 | `matter_closed`, `duplicate_document`, `run_in_progress`, `idempotency_conflict`, `version_conflict`, `document_not_ready`, `document_quarantined`, `export_blocked`, `job_not_cancellable` |
| 413 | `file_too_large`, `too_many_pages` |
| 415 | `unsupported_type` |
| 422 | `validation_error`, `invalid_scope`, `malware_detected`, `confirmation_mismatch`, `not_assistant_message` |
| 428 | `idempotency_key_required` |
| 503 | `scanner_unavailable` |

---

## 8. Quality bar

- **Tests:** unit, API (FastAPI TestClient), streaming, ingestion and security suites. Docling and ClamAV tests are
  marked and run with `pytest -m slow`; the default suite stays under a minute. Line coverage of 85% or more.
- **Security tests that must stay green:** cross-matter leaks (DEC-53), audit coverage and chain (DEC-68), log hygiene
  (DEC-68), no egress (DEC-56), clean export (DEC-50), real deletion (DEC-58), injected instructions never reaching a
  chunk (DEC-59).
- **Code:** ruff and mypy clean; no client text in any log line or exception message; every route has a response
  model, an operation ID and its error codes documented in OpenAPI.
- **Contract:** `openapi.json` is committed, and a test fails when the API drifts from it without the file being
  updated.

---

## 9. Decisions for you to approve

1. **Location and layout:** `LegalLens/backend/`, package `legallens`, src layout, uv.
2. **Python 3.13 managed by uv**, because the installed 3.14 can't load sqlite-vec (§3.4).
3. **Sync SQLAlchemy** in thread-pool routes, with async only for the SSE streams and chat runs.
4. **Schema additions** in §4.2, mainly the `runs` and `matter_events` tables.
5. **Six new endpoints**, each needed by the frontend plan or for operations: `/health`, `/auth/dev-session`,
   `/documents/{id}/pages`, `/documents/{id}/hidden-content`, `/jobs/{id}/cancel` and `/jobs/{id}/file`. That makes
   43 in total. Also some small contract choices: `?confirm=` to delete a matter, `?dry_run=` to delete a document,
   checklist acknowledgments sent through `PATCH /drafts/{id}`, and `?kind=` on export (as in frame 2).
6. **A chat run starts when the message is posted**, not when the stream opens, so a late or dropped stream never
   loses a turn. This differs slightly from step 2 of frame 3.
7. **A clean export needs all three:** no placeholders, every checklist row acknowledged, and the draft marked
   "Reviewed and adopted". Editing an adopted draft returns it to "not reviewed".
8. **Copyleft licences:** PyMuPDF is AGPL-3.0 and extract-msg is GPL-3.0. Both are fine while LegalLens runs only for
   you. Revisit them before LegalLens is offered to other lawyers (DEF-26). The swaps would be pypdfium2 and an
   olefile-based MSG reader.
9. **Installs on your Mac:**
    - ClamAV through Homebrew, plus about 300 MB of virus definitions
    - Docling and PyTorch (about 2–3 GB in the virtual environment), plus its models, downloaded once and then used
      offline
10. **Hashing embedder by default.** Search quality from its vectors is lexical only. The real embedding model comes
    with the Slice 0 benchmark (DEF-01).
11. **No git commits** unless you ask. Runtime data in `backend/var/` is git-ignored.

---

## 10. Build notes (2026-10-07)

### 10.1 Findings that changed the setup

- **iCloud.** The Desktop (so this project) syncs to iCloud Drive. A data folder inside the project would have
  uploaded the database and client files to iCloud, breaking DEC-08. The data folder now defaults to the OS
  app-data folder (`~/Library/Application Support/LegalLens` on macOS), which is not synced, with permissions `700`.
  The Docling models moved there too.
- **Virtual environment.** iCloud kept re-marking files under `.venv` as hidden, and Python 3.13 skips hidden `.pth`
  files, which broke `import legallens`. The environment lives in `.venv.nosync` (iCloud skips `.nosync`) with
  `.venv` as a link to it.
- **Python.** uv-managed Python 3.13 loads sqlite-vec v0.1.9. The partition key and the metadata filter, including
  `document_id IN (…)`, work inside the KNN query, so "This document" needs no over-fetching. The project is pinned to
  `>=3.13,<3.14`, and the lockfile excludes Intel Macs (PyTorch has no wheels there).
- **FastAPI 0.142 ships OpenTelemetry hooks** whose log signal records exception messages. All of them are switched
  off (`telemetry=` and `OTEL_SDK_DISABLED`), because nothing may leave the machine (DEC-56).
- **sse-starlette logs every streamed chunk at DEBUG**, answer text included; the log-hygiene test caught it.
  Logging is now an allowlist: LegalLens loggers at INFO, and known third-party loggers held at WARNING.
- **ClamAV** runs as a login agent (`brew services start clamav`). It stopped once overnight; uploads failed closed
  with 503 as designed. After a reboot: `brew services restart clamav`.

### 10.2 Differences from the plan (to carry into the Technical Architecture doc)

- **Tables:** `runs` and `matter_events`, as planned. Also `matter_id` on every table holding client data, which goes
  further than frame 7 (messages, citations, traces, feedback, pages and draft versions carry it too). Plus small
  columns: `messages.request_hash`/`error_json`, `conversations.title_source`, `documents.metadata_json`,
  `drafts.title`/`instructions`/`job_id`.
- **FTS5** indexes `(text, header)`, where `header` is "Doc › section › clause", instead of `(text, section_path)`.
- **Endpoints:** 43, as planned (37 + 6). Contract details settled in the build:
  - the `citation` SSE event also carries `document_id`
  - `answer_state` carries `outside_law`
  - `job` carries `entity_id` (the summary or draft id)
  - point-by-point statuses are `addressed | flagged | missing` ("flagged" = the section exists but still has
    placeholders)
  - `CitationLocation` has `boxes` per paragraph
- **Pinpoints are per paragraph, not per chunk.** Each chunk stores every paragraph's page, box, clause reference and
  character offsets, so a citation names the exact paragraph (4.2(b)(i)) and highlights only it.
- **Chunk overlap** repeats the tail sentences of the previous chunk (about 15%), not whole paragraphs.
- **Docling** moves list numbering ("4.1", "(a)") into a separate `marker`; the converter puts it back in front of the
  text, or clause references would be lost.
- **Folder structure:** no `repositories/` package. The matter-scope guard works on the session, and services use it
  directly. Migrations live inside the package. `search/pinpoint.py` and `search/sentences.py` were added.
- **Citation checklist:** "full text uploaded" needs the document's opening (caption) to name the authority and to
  read like an opinion or a statute. The matter's own caption ("Smith v. Acme Corp") is never listed.

### 10.3 Measured on this Mac (synthetic documents)

| Measure | Result |
| --- | --- |
| Docling ingestion, 200-page digital PDF | 105 s (about 114 pages a minute); 1,220 chunks; 200 of 200 pages read |
| Full sample set (7 documents, including 2 OCR pages) | about 14 s, after models load |
| Upload request (2 MB PDF, ClamAV scan) | 80 ms; clamd scan about 40 ms (one 10 s outlier while clamd was reloading) |
| Hybrid search over 1,220 chunks | p50 6 ms, p95 11 ms |
| Chat, first token (live server, stub) | about 48 ms, against the ≤ 5 s target; the model's time comes on top later |
| Tests | 111 passing (109 default + 2 slow), 90% line coverage, ruff and mypy clean |

### 10.4 Still open

- **Real sign-in:** argon2id, TOTP enrolment, lockout and the CSRF header.
- **Encryption:** SQLCipher, an encrypted file store and encrypted backups with a restore test (Slice 4).
- **Orchestration:** the LangChain orchestrator (router, rewrite, reranker, verifier, output guard) replacing the stub
  behind `Orchestrator`. Its `/health` entry should then ping the model server; the stub always reports ok, and the
  frontend pauses every AI action when it isn't (`INTEGRATION_TODO.md` §3, added 2026-10-10).
- **Embeddings:** the real embedding model picked by the Slice 0 benchmark (DEF-01). Changing `EMBED_DIM` means
  recreating `chunks_vec` and re-embedding.
- **MSG files:** a test with a real .msg file.
- **Frontend:** wiring the frontend's `HttpApiClient` to `openapi.json` (no CORS needed: Vite can proxy `/api`).

### 10.5 Integration Phase 1 (2026-10-10)

The backend gained what the frontend needs, as planned in [INTEGRATION_TODO.md](INTEGRATION_TODO.md) (tasks
INT-1.1 to INT-1.8, decisions 1 to 5, and the change log in its §7):

- **Endpoints:** 49 (43 + 6): `listSummaries`, `exportSummary`, `listDrafts`, `createDraft`,
  `proposeSectionRewrite` and `proposeClaimResponse`. `openapi.json` is regenerated.
- **Schema:** migration `0002` adds `messages.searched_json` and `job_json`, `summaries.conversation_id`, seven
  draft columns (`date_line`, `model_id`, `prompt_version`, set-aside claims, named sources and stored previews),
  `draft_versions.label` and `exports.summary_id`. The dev database was reset and reseeded so page blocks carry
  their pinpoint `ref`.
- **Events:** `citation` has `quote`; `answer_state` has `searched`; `job.progress` has `step_code`, `detail` and
  the summary or draft id; `job.done` has the entity id and its name or title; document events have `name` and
  `quarantined`.
- **Rules that changed:**
  - "Reviewed and adopted" is refused while anything else is open (409 `review_blocked`).
  - A safeguards change after adoption un-adopts the draft.
  - Unanswered claims that aren't set aside block the clean export.
  - Draft exports print the draft's date line.
- **Tests:** 129 (127 by default + 2 slow), 90% line coverage. New tests cover the migrations against the models
  and the event payloads, and the isolation test now includes every draft endpoint.

### 10.6 Integration Phases 3 to 5 (2026-10-11)

- **`PATCH /auth/me`** saves the lawyer's licensing states (two-letter codes, sorted, de-duplicated). 50 endpoints.
- **`/health`** has a `storage` component (free space where the data lives; not ok under 2 GB or 5% free) and the
  orchestrator's `detail` carries the model and prompt versions.
- **Drafts are signed with the matter owner's name.** The letter's sign-off and the memo's From line no longer
  carry `[ATTORNEY NAME]` and `[FIRM NAME]`: the screen hid them but the export gate counted them. There is no firm
  field, so the firm line is gone.
- **The built frontend is served by the API** (`legallens/web.py`, setting `frontend_dir`, default
  `frontend/dist`): hashed assets cached for a year, `index.html` never cached, an SPA fallback, unknown `/api`
  paths a JSON 404, no path traversal, and a same-origin CSP. `legallens serve --worker` also runs the worker.
- **Still open:** `serve` does not start a worker unless `--worker` or `LEGALLENS_INPROCESS_WORKER=true` is set.
  A supervised on-demand worker (starts for a job, exits when idle, so Docling's memory is returned) was
  considered and left out on 2026-10-11.

