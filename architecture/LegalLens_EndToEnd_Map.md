# LegalLens: End-to-End Map (mind map and UML)

> **As built, 2026-10-21.** Companion to [LegalLens_Technical_Architecture_v0.1.md](LegalLens_Technical_Architecture_v0.1.md).
> Where the two differ, this file shows what the code does. The diagrams are Mermaid, so they render on GitHub and in VS Code's Markdown preview.
> Section 9 maps every diagram to the UAT test cases (TC-01 to TC-25), so you can tick the human tests against the flow they exercise.

**Contents:** 1 Mind map · 2 Layers · 3 Data model · 4 Sign-in · 5 Upload and ingestion · 6 Ask · 7 Summarize · 8 Draft, review and export · 9 State machines · 10 Deployment · 11 Human-test map

---

## 1. Mind map: the whole product

```mermaid
mindmap
  root((LegalLens))
    Who
      One solo lawyer
      One workspace
      Matters keep clients apart
    Features
      Ask
        Answers only from uploaded documents
        Citations open the cited passage
        Found / Partial / Not found
        Outside law gets a notice
      Summarize
        Existing or newly uploaded document
        Templates and audiences
        Coverage report
        Word export
      Draft
        Response letter
        Memo
        Placeholders and CITE NEEDED
        Review gate then clean .docx
    Screens
      Sign-in and 6-digit code
      Matters list
      Workspace
        Chat and prompt bar
        Sidebar of chats
        Documents library
        Right panel viewer or draft editor
        Matter profile
      Settings and Where your data goes
      Command palette
      Lock screen after idle
    Backend
      FastAPI REST plus SSE
      Worker for long jobs
      Orchestrator
      Services
      Audit log
    Data
      SQLite one file
      FTS5 keyword index
      sqlite-vec vectors
      Encrypted original files
    Models, all local
      Ollama qwen2.5 7B for Ask
      Ollama qwen2.5 14B for summary and draft
      Ollama llama3.2 3B for rewrite
      bge-m3 embedder in process
      bge-reranker-v2-m3 in process
    Safety
      Matter id on every query
      Local ClamAV scan
      Hidden content stripped
      Document text fenced as data
      Verifier checks every quote
      Nothing leaves the machine
    Quality gates
      Unit and API tests
      Browser tests
      UAT workbook 27 of 27
      Golden set release gate
      CI with gitleaks
```

---

## 2. Layers and components

```mermaid
flowchart LR
  subgraph Browser["Browser: React + TypeScript SPA"]
    UI["Screens<br/>auth, matters, chat, documents,<br/>viewer, summaries, drafts, settings"]
    Q["TanStack Query (REST)"]
    ES["EventSource (SSE)"]
    ZS["Zustand (UI state)"]
    UI --> Q
    UI --> ES
    UI --> ZS
  end

  subgraph API["FastAPI process, 127.0.0.1"]
    MW["Middleware<br/>request id, session cookie,<br/>idle timeout, matter scope"]
    R["Routers /api/v1<br/>auth, matters, conversations,<br/>chat, documents, drafts, jobs, audit, health"]
    SV["Services<br/>chat, documents, summaries, drafts,<br/>exports, deletion, audit, events"]
    RUN["Run service<br/>streaming/runs.py<br/>buffers SSE events"]
    ORCH["LocalOrchestrator<br/>rewrite, search, answer, verify"]
    SEARCH["search/<br/>FTS5 + vec, RRF, pinpoint"]
    EMB["Embedder bge-m3<br/>Reranker bge-reranker-v2-m3<br/>(in process)"]
    GW["Model gateway models/llm.py<br/>refuses any non-local URL"]
    MW --> R --> SV
    SV --> RUN --> ORCH
    ORCH --> SEARCH
    SEARCH --> EMB
    ORCH --> GW
  end

  subgraph Worker["Worker process / thread"]
    JQ["jobs/queue.py<br/>claim, heartbeat, 3 attempts"]
    H["Handlers<br/>ingest, summarize, draft,<br/>regenerate, export"]
    ING["ingestion/<br/>sniff, scan, hidden, triage,<br/>convert, legal, chunker, pipeline"]
    JQ --> H --> ING
  end

  OLL[("Ollama<br/>qwen2.5 7B / 14B<br/>llama3.2 3B")]
  CLAM[("ClamAV clamd<br/>Unix socket")]
  DB[("SQLite legallens.db<br/>tables + chunks_fts + chunks_vec<br/>audit_log hash-chained")]
  FS[("File store<br/>originals, per-matter folder,<br/>quarantine/")]

  Q -- "REST JSON" --> MW
  ES -- "GET stream, GET events" --> MW
  GW --> OLL
  H --> GW
  SV --> DB
  SEARCH --> DB
  JQ --> DB
  ING --> DB
  ING --> FS
  SV --> FS
  SV -- "scan on upload" --> CLAM
```

**Reading it.** The browser only ever talks to FastAPI. Commands go over REST; streams (a chat turn, matter events) go over SSE. Long work is queued in the `jobs` table and the worker picks it up. The only model server is Ollama on localhost, reached through one gateway.

---

## 3. Data model (class diagram)

22 tables. Everything below `Matter` carries `matter_id`, and the session scope guard adds `WHERE matter_id = ?` to every query.

```mermaid
classDiagram
  direction LR
  class User {
    id
    email
    name
    licensing_states
  }
  class AuthSession {
    token_sha256
    expires_at
    idle_timeout
  }
  class Matter {
    id
    name
    client_name
    our_side
    court
    jurisdiction
    profile_json
    ai_consent_json
    status: open|closed
  }
  class Conversation {
    title
    pinned
    summary (rolling memory)
  }
  class Message {
    role: user|assistant
    status: complete|streaming|cancelled|failed
    answer_state: found|partial|not_found
    model_id
    prompt_version
  }
  class MessageCitation {
    document_id
    n ([n] in the answer)
    page
    bbox
    quote
    verified
  }
  class RetrievalTrace {
    rewritten_query
    sparse_hits
    dense_hits
    reranked_ids
    gate_score
  }
  class Feedback {
    kind
    note
  }
  class Run {
    status: running|done|cancelled|failed
  }
  class Document {
    filename
    sha256 (unique per matter)
    origin: client|other_party
    status: queued|processing|ready|failed|quarantined
    scan_status
    coverage_json
    hidden_content_json
    parent_document_id
  }
  class DocPage
  class Chunk {
    text
    header
    pinpoint
    parent chunk
  }
  class DefinedTerm
  class Summary {
    template
    audience
    fields
    coverage
  }
  class Draft {
    type: response_letter|memo
    status: generating|not_reviewed|reviewed_adopted|failed
    waived_claims
    acknowledgments
    proposals
  }
  class DraftVersion {
    version_no
    content (sections)
    checks
  }
  class Export {
    kind
    file
    clean_check
  }
  class Job {
    kind: ingest|summarize|draft|regenerate|export
    status: queued|running|done|failed|cancelled
    progress
    attempts
  }
  class MatterEvent {
    id (SSE id)
    type
  }
  class AuditLog {
    prev_hash
    hash
    ids and counts only
  }
  class IndexMeta {
    embedding model of the vectors
  }

  User "1" --> "*" AuthSession
  User "1" --> "*" Matter : owns
  Matter "1" --> "*" Conversation
  Conversation "1" --> "*" Message
  Message "1" --> "*" MessageCitation
  Message "1" --> "0..1" RetrievalTrace
  Message "1" --> "*" Feedback
  Conversation "1" --> "*" Run
  Matter "1" --> "*" Document
  Document "1" --> "*" DocPage
  Document "1" --> "*" Chunk
  Document "1" --> "*" DefinedTerm
  Document "1" --> "*" Document : email attachments
  MessageCitation --> Chunk : points at
  Document "1" --> "*" Summary
  Matter "1" --> "*" Draft
  Draft "1" --> "*" DraftVersion
  Draft "1" --> "*" Export
  Draft ..> Document : incoming + supporting
  Matter "1" --> "*" Job
  Matter "1" --> "*" MatterEvent
  Chunk ..> chunks_fts : keyword index
  Chunk ..> chunks_vec : vector index
```

---

## 4. Sign-in and session

Dev mode accepts any password and any 6-digit code (`lawyer@legallens.local`).

```mermaid
sequenceDiagram
  actor L as Lawyer
  participant FE as Browser
  participant API as FastAPI /auth
  participant DB as SQLite

  L->>FE: email + password
  FE->>API: POST /auth/login
  API-->>FE: 200 mfa required (or 401 / 423 locked)
  L->>FE: 6-digit code
  FE->>API: POST /auth/mfa/verify
  API->>DB: create session (SHA-256 of token)
  API->>DB: audit row
  API-->>FE: Set-Cookie ll_session (HttpOnly, SameSite=Strict)
  FE->>API: GET /auth/me
  API-->>FE: user, session expiry, idle timeout, app info
  Note over FE,API: 30 min idle timeout, 12 h maximum
  FE->>FE: idle warning, then lock screen
  L->>FE: sign out
  FE->>API: POST /auth/logout (204)
```

---

## 5. Upload and ingestion

The request only validates, scans, stores and queues. The worker does the rest.

```mermaid
sequenceDiagram
  actor L as Lawyer
  participant FE as Browser
  participant API as FastAPI /documents
  participant AV as ClamAV
  participant FS as File store
  participant DB as SQLite
  participant W as Worker
  participant EV as Matter event stream (SSE)

  L->>FE: drop a file, pick origin (client / other party)
  FE->>API: POST /matters/{id}/documents
  API->>API: size under 50 MB, type by bytes, under 300 pages,<br/>not encrypted or damaged
  API->>API: SHA-256, duplicate returns 409 with existing id
  API->>AV: scan
  alt scanner down
    API-->>FE: 503 scanner_unavailable, nothing stored
  else infected
    API->>FS: move to quarantine/
    API-->>FE: 422 malware_detected
  else clean
    API->>FS: write original (sealed)
    API->>DB: document=queued, job=ingest
    API-->>FE: 202 {document_id, job_id}
  end

  W->>DB: claim job (UPDATE ... RETURNING)
  W->>W: hidden content found and stripped (kept for review)
  W->>W: route by format (PDF, DOCX, EML/MSG split, TXT)
  W->>W: per-page triage: text layer or OCR (Tesseract)
  W->>W: convert (Docling or fast converter)
  W->>W: legal structure: clauses, defined terms, Bates
  W->>W: chunk 300-500 tokens, header prefix
  W->>W: embed with bge-m3
  W->>DB: ONE transaction: pages, chunks, FTS5, vectors, terms
  W->>DB: coverage report, document=ready
  W-->>EV: job.progress ... document.ready
  EV-->>FE: UI updates the library
  opt failure
    W->>DB: retry up to 3 times, then document=failed with a reason
  end
```

Delete is the mirror image: `DELETE /documents/{id}` removes the file, pages, chunks, FTS rows, vectors, terms, summaries and citations in one transaction (TC-24).

---

## 6. Ask: one chat turn

```mermaid
sequenceDiagram
  actor L as Lawyer
  participant FE as Browser
  participant API as FastAPI /conversations
  participant RS as Run service
  participant OR as LocalOrchestrator
  participant SR as Search (FTS5 + vec)
  participant RR as Embedder + Reranker
  participant LLM as Ollama
  participant DB as SQLite

  L->>FE: question (scope: this document or whole matter)
  FE->>API: POST /conversations/{id}/messages (Idempotency-Key)
  API->>DB: user message, empty assistant message (streaming), run, audit
  API->>RS: start run as background task
  API-->>FE: 202 {message_id, run_id, stream_url}
  FE->>API: GET /runs/{run_id}/stream (SSE)
  RS-->>FE: replay buffered events, then live

  RS->>OR: run(context: last 6 turns, matter profile, scope)
  OR-->>FE: intent, scope, status events
  alt follow-up question
    OR->>LLM: rewrite with llama3.2 3B
    LLM-->>OR: standalone question
  end
  OR->>RR: embed the query (bge-m3)
  OR->>SR: sparse top hits and dense top hits, both filtered by matter_id
  SR-->>OR: fused by RRF (k=60), top 50
  OR->>RR: rerank, keep 8
  alt gate fails (rerank score and keyword share too low)
    OR-->>FE: answer_state = not_found, "Not found in your documents"
  else passes
    OR->>LLM: passages fenced as data, qwen2.5 7B
    LLM-->>OR: tokens with [n] markers
    OR-->>FE: token events
    OR->>OR: verifier: [n] valid, quote literal,<br/>figures present, words overlap
    OR-->>FE: citation events, answer_text (checked, renumbered), answer_state
  end
  RS->>DB: save message, citations, retrieval trace, usage, run status, title
  RS-->>FE: done
  FE->>FE: sidebar re-sorts on conversation.updated

  opt Stop
    FE->>API: POST /runs/{id}/cancel
    RS-->>FE: done {cancelled: true}
  end
  opt stream drops
    FE->>API: reconnect with Last-Event-ID, server replays
  end
  opt click a citation chip
    FE->>API: GET /citations/{id}
    API-->>FE: page, box, quote
    FE->>FE: PDF viewer highlights the passage (TC-05)
  end
```

**Router (as built).** The prompt-bar mode if one is set; otherwise keywords (summarize, draft, reply, respond, memo); otherwise Ask; Clarify if the message has no content words or names an unknown document. The LLM intent router in the design was not built.

**Answer states:** `found` (all claims verified), `partial` (some citation unverified, or outside law noted, TC-08), `not_found` (gate refused or the model said not found, TC-07).

---

## 7. Summarize

```mermaid
sequenceDiagram
  actor L as Lawyer
  participant FE as Browser
  participant API as FastAPI
  participant DB as SQLite
  participant W as Worker
  participant LLM as Ollama (qwen2.5 14B, or 7B when over 20 pages)
  participant EV as Matter events

  L->>FE: pick a document (existing, or upload from chat), choose template and audience
  FE->>API: POST /matters/{id}/summaries
  API->>DB: summary placeholder, job=summarize
  API-->>FE: 202 {job_id}
  W->>DB: claim job
  W->>DB: read every chunk in reading order (no retrieval)
  loop per template field and section
    W->>LLM: map call (text fenced as data)
  end
  W->>W: reduce, then coverage report (pages read / unreadable)
  W->>DB: save summary, job=done
  W-->>EV: job.progress ... job.done
  EV-->>FE: summary card appears
  L->>FE: Export to Word
  FE->>API: POST /summaries/{id}/export
  API-->>FE: clean .docx (TC-15)
```

---

## 8. Draft, review and export

```mermaid
sequenceDiagram
  actor L as Lawyer
  participant FE as Browser
  participant API as FastAPI /drafts
  participant DB as SQLite
  participant W as Worker
  participant LLM as Ollama (qwen2.5 14B)

  L->>FE: "Draft a response to the demand letter" (or "a memo")
  FE->>API: via chat turn: intent=draft, or POST /matters/{id}/drafts
  API->>DB: draft=generating, job=draft
  API-->>FE: 202 {draft_id, job_id}
  W->>DB: read incoming letter, extract its points
  loop per point
    W->>DB: retrieve facts from supporting documents
    W->>LLM: write a paragraph (point fenced as data)
  end
  W->>W: Rule 4.2 / 4.3 and FRE 408 safeguards
  W->>W: placeholders [FILL], [CITE NEEDED], [UNVERIFIED: ...]
  W->>DB: DraftVersion 1, checks computed, draft=not_reviewed

  L->>FE: edit sections (each save = new version)
  FE->>API: PATCH /drafts/{id}
  L->>FE: ask chat to refine one section
  FE->>API: refine, proposal preview, Accept
  API->>DB: new version with diff
  L->>FE: open checks
  FE->>API: GET /drafts/{id}/checks
  API-->>FE: citation checklist, point-by-point response check, placeholders left

  L->>FE: Mark reviewed
  FE->>API: POST /drafts/{id}/review
  alt placeholders left or citations not acknowledged
    API-->>FE: 409 review_blocked, lists the blockers
  else all resolved
    API->>DB: draft=reviewed_adopted
  end
  L->>FE: Export .docx
  FE->>API: POST /drafts/{id}/export
  API->>API: strip properties, comments, source notes
  API->>API: re-open the file and verify it is clean
  API-->>FE: clean .docx (TC-19). LegalLens never sends or files anything.
```

---

## 9. State machines

```mermaid
stateDiagram-v2
  direction LR
  state "Document" as D {
    [*] --> queued
    queued --> processing
    processing --> ready
    processing --> failed
    queued --> quarantined: infected
    ready --> [*]: delete removes everything
  }
```

```mermaid
stateDiagram-v2
  direction LR
  state "Job" as J {
    [*] --> queued
    queued --> running: worker claims
    running --> done
    running --> queued: retry (max 3, backoff)
    running --> failed
    queued --> cancelled
    running --> cancelled
  }
```

```mermaid
stateDiagram-v2
  direction LR
  state "Draft" as DR {
    [*] --> generating
    generating --> not_reviewed
    generating --> failed
    not_reviewed --> not_reviewed: edit makes a new version
    not_reviewed --> reviewed_adopted: gate passes
    reviewed_adopted --> not_reviewed: any edit un-adopts
  }
```

```mermaid
stateDiagram-v2
  direction LR
  state "Matter, Run and Answer" as M {
    [*] --> open
    open --> closed: close (writes then return 409 matter_closed)
  }
  state "Chat turn" as T {
    [*] --> running
    running --> done
    running --> cancelled: Stop
    running --> failed: error, or API restart
  }
  state "Answer" as A {
    [*] --> found
    [*] --> partial
    [*] --> not_found
  }
```

---

## 10. Deployment: what runs on the machine

```mermaid
flowchart TB
  subgraph Mac["The lawyer's computer (nothing else is involved)"]
    B["Browser"]
    subgraph Procs["Local processes"]
      A["uvicorn / FastAPI :8000<br/>(embedder and reranker inside)"]
      WK["Worker"]
      O["Ollama :11434"]
      C["clamd (Unix socket)"]
    end
    D[("~/Library/Application Support/LegalLens<br/>legallens.db, files, quarantine, logs/errors")]
    B --> A
    A --> O
    A --> C
    WK --> O
    A --> D
    WK --> D
  end
  BK["Encrypted nightly backup<br/>(the only data that can leave)"]
  D -.-> BK

  subgraph Dev["Development and release"]
    GH["GitHub (private) CI:<br/>backend, frontend, contract, gitleaks"]
    SR["Self-hosted runner ~/actions-runner<br/>golden-gate on Ollama"]
    GH --> SR
  end
```

---

## 11. Human-test map: flow to UAT case

Tick these during the walkthrough. Each row says which diagram the case exercises and what to look for that automation cannot judge.

| Case | What you do | Diagram | What a human should judge |
|---|---|---|---|
| TC-01 | Sign in with the 6-digit code | 4 | Does the two-step flow feel clear? Any dead end? |
| TC-02 | Open a matter | 2 | Does the workspace open fast? |
| TC-03 | Upload three documents, set who each came from | 5 | Are progress steps understandable? Is the coverage report honest? |
| TC-04 | Ask a question | 6 | Is the answer right, and is every citation actually supported? |
| TC-05 | Open a citation | 6 | Is the highlight on the right sentence? |
| TC-06 | Follow-up question | 6 | Did it understand "and how much notice?" |
| TC-07 | Unanswerable question | 6 | Is "Not found" clear and helpful, with no invented answer? |
| TC-08 | Outside-law question | 6 | Is the notice clear that LegalLens has no outside law? |
| TC-09 to TC-13b | Rename, pin, search, feedback, ask again, delete and undo | 6 | Anything lost or surprising? |
| TC-14, TC-16 | Summarize existing or new document | 7 | Is the summary faithful? Does the coverage report match the pages? |
| TC-15 | Export summary to Word | 7 | Open in Word: formatting good, no metadata? |
| TC-17, TC-17b | Draft a memo (also in plain words) | 8 | Does auto mode choose a memo, not a letter? |
| TC-18 | Draft a response letter | 8 | Does each paragraph answer the right point, with sensible placeholders? |
| TC-19 | Resolve placeholders, acknowledge citations, adopt, export | 8, 9 | Does the gate block until it should? Is the .docx clean (File > Info in Word)? |
| TC-20 | Settings, About | 2, 10 | Every layer green, model named? |
| TC-21 | Where your data goes | 10 | Plain-language and true? |
| TC-22 | Command palette (⌘K) | 2 | Finds chats and documents? |
| TC-23 | Open another matter | 3 | Nothing from the first matter appears anywhere |
| TC-24 | Delete a document | 5 | Gone from the library, and a question about it no longer finds it |
| TC-25 | Phone-width layout | 2 | Ask and document list stay usable |

**Not covered by a numbered case (worth a manual pass):** lock screen after idle, closing a matter (writes blocked), Stop mid-answer, the scanner being down, a scanned PDF through OCR, and the known miss "Who is the judge in this case?" on a real opinion.
