# LegalLens Integration: Plan and To-Do

> **Status:** Approved 2026-10-10 (all ten decisions in §4) · Phases 0, 1 and 2 done 2026-10-10 · **Date:** 2026-10-10
> **Scope:** Connect the React frontend to the FastAPI backend: reconcile the contract, add what the backend is
> missing, build the real `HttpApiClient`, change the screens whose behaviour differs, and prove every main flow end
> to end. The LangChain orchestrator, real sign-in and encryption stay out of scope (the stub, dev sign-in and plain
> SQLite carry on).
> **Sources:** [FRONTEND_TODO.md](FRONTEND_TODO.md), [BACKEND_TODO.md](BACKEND_TODO.md), the
> [Technical Architecture](architecture/LegalLens_Technical_Architecture_v0.1.md) (API reference) and
> `backend/openapi.json`. DEC, SUG, DEF and RISK IDs refer to [IDEAS.md](IDEAS.md).

**How this file works:** each task has an ID (`INT-2.6`) and a checkbox. Phases run in order and each ends with a
demo. Nothing is built until you approve this plan and the preconditions in §1 are met. Every change to the plan,
and the reason for it, is recorded in §7.

---

## 1. Where things stand (2026-10-07)

| Side | State |
| --- | --- |
| Backend | Built and tested: 43 endpoints, both SSE streams, 111 tests. The contract is `backend/openapi.json`. Answers come from the stub orchestrator |
| Frontend | Phases 0 and 5–7 done (Phase 7, drafts, finished 2026-10-07), Phases 8–9 open: 41 of 65 tasks ticked. Every screen talks to one `ApiClient` interface through hooks in `src/api/queries`; `MockApiClient` implements it; `src/api/http/HttpApiClient.ts` is an empty placeholder |
| The seam | `src/app/providers.tsx` creates the client in one line (`createMockApiClient()`), so switching to the real client is one place |
| The gap | The mock's contract was written before the backend existed and has drifted: names, shapes, missing data, and in drafts, different rules (§3) |

**Preconditions before Phase 1:**

1. The frontend session has finished Phase 7, or has frozen `src/api/types.ts`, `src/api/client.ts`,
   `src/api/events.ts`, `src/api/queries/*` and `src/lib/drafts.ts`. Two sessions must never edit these at once.
   **Met 2026-10-10:** Phase 7 is finished, and the frontend session has frozen these files. Integration owns them
   until its Phase 3 ends. The last frontend change before the freeze applied decision 1 to the mock: the citation
   checklist lists legal authority only.
2. You approve the decisions in §4. **Met 2026-10-10:** all ten approved by the owner, unchanged.

---

## 2. Principles

1. **The API contract is the source of truth for data, and the server is the source of truth for rules.** Matter
   scope, the citation checklist, the export gate and deletion are enforced on the server (DEC-49, DEC-50, DEC-53,
   DEC-58). The browser shows them; it never decides them.
2. **Screens keep their own types; the client translates.** The frontend's domain types stay as view models.
   `HttpApiClient` maps the wire format (snake_case, generated from `openapi.json`) to them. Screens change only
   where the behaviour differs.
3. **Drift breaks the build.** Wire types are generated from `openapi.json`, and the backend already fails a test when
   its API changes without `openapi.json`. A contract change then shows up as a TypeScript error, not a runtime bug.
4. **The mock stays.** `VITE_API=mock|http` picks the client. The mock implements the same interface, so UI work,
   demos and fast tests still run without the backend.
5. **One fix per mismatch, in one place:** a backend addition, an adapter mapping or a frontend change, as §3 says.
6. **Synthetic documents only (DEC-73).** No encryption at rest yet.

---

## 3. Contract reconciliation

Each row is one difference found on 2026-10-07 and re-checked against the frozen frontend on 2026-10-10 (INT-0.5,
which changed two rows and added two). **A** = map it in `HttpApiClient` (no screen change);
**B** = backend addition; **F** = frontend change. Every **B** was built in Phase 1 (2026-10-10); three rows were
added then, marked "Phase 1". Frontend Phase 8 (2026-10-10) added four more, marked "FE Phase 8": they are open;
INT-3.10 (approved 2026-10-10) closes the first three, and the fourth waits for the real orchestrator (§7).

| Area | Frontend expects | Backend has | Fix |
| --- | --- | --- | --- |
| All bodies | camelCase | snake_case | A |
| IDs | strings | strings, except citation and audit ids (integers) | A: `String(id)` |
| User | `name`, `firstName`, `initials`, `email` | `user {id, email, name, licensing_states, …}` inside `Me` | A: derive first name and initials |
| Sign-out | no method | `POST /auth/logout` | F: add to the interface |
| Matter list | full `Matter`: opposing party, opposing counsel, court, practice area, document count | `MatterSummary`: id, name, client, status, document count, last activity | B: add opposing party, opposing counsel, court and practice area to the list items |
| Matter detail | `opposingParty`, `opposingCounsel {name, firm}` | `profile.parties[]` with roles and counsel | A: the first party with role `opposing` |
| Matter admin | no methods (FE-3.8, FE-3.9 open) | create, edit, close, export, delete | F: add to the interface |
| Lists | arrays | cursor pages | A: walk `next_cursor` until done (lists are small); real paging later if needed |
| Scope | `{kind: 'all'}` or `{kind: 'document', documentId}` | `{kind: all \| documents, document_ids}` | A |
| Send a message | no chat needed (`conversationId?`); returns `conversationId` | the chat must exist; `Idempotency-Key` required | A: create the chat first; one key per send, reused on retry |
| Send options | `summary {template, audience}`, `draft {type}` | `options {summary_template, audience, draft_type, incoming_document_id, …}` | A |
| `citation` event | a full `Citation` including `quote` | no `quote` | B: add `quote` |
| `answer_state` event | `searched {scopeLabel, rewrittenQuestion, documentsSearched, passagesReviewed}` | `{state, outside_law}` | B: add `searched` (the retrieval trace has it) |
| `job` event | `summaryId` or `draftId` | `entity_id` + `kind` | A |
| Stored messages | `searched`, `stopped`, `job {kind, id}` | no `searched`; `status` cancelled; `job_id` only | B: add `searched` and `job {kind, entity_id}`; A: `stopped` = status cancelled |
| Stop | aborts the stream | the run keeps going until `POST /runs/{id}/cancel` | A: abort the stream and call cancel |
| `job.progress` | per kind: entity id, `step` code (e.g. `ocr`), `detail` | `{job_id, kind, pct, step (free text), document_id?}` | B: add `step_code`, `detail` and `summary_id` / `draft_id` |
| `job.done` | `summaryId` + `documentName`, or `draftId` + `title` | `{job_id, kind, result_url}` | B: add the entity id and its name or title |
| `document.ready` / `document.failed` | `name`; `quarantined` on failure | `{document_id, coverage}`, `{document_id, reason}` | B |
| Coverage | `pagesRead`, `unreadablePages`, `lowConfidencePages[{page, confidence}]` | `pages_read`, `pages_unreadable`, `low_confidence_pages[{page, ocr_conf}]`, `ocr_pages`, `text` | A |
| Document | `name`, `kind`, `pages`, `progress`, `step`, `hiddenItems[]`, `error` string | `filename`, `mime`, `pages_total`, `hidden_content {kinds, count}`, `error {code, message}` | A: `kind` from the file type; progress and step from events |
| Hidden content | items inside the document object | only through the audited `GET /documents/{id}/hidden-content` (DEC-59: a deliberate step) | F: the notice shows kinds and count; "View hidden content" calls the endpoint |
| Upload | file details + a browser-computed SHA-256, no bytes | multipart file + origin; the server hashes, scans and checks | F: send the `File` (with upload progress); keep the browser check as an early hint |
| Viewer pages | `blocks[{anchor, kind: heading \| paragraph \| meta, text}]` | `blocks[{id, kind, text, bbox, section_path}]` | B: add each block's `ref` (its clause or ¶ pinpoint); A: map the kinds |
| Deletion preview | `{pages, passages, citations, conversations}` | dry run: `{documents, pages, chunks, fts_rows, vectors, citations, defined_terms, summaries, file_bytes}` | B: add `conversations`; A: passages = chunks |
| Summary list | `listSummaries(matterId)` | none | B: `GET /matters/{id}/summaries` |
| Summary | sections `{key, title, body \| null}` + a flat `citations` list; `documentName`, `conversationId`, `progress`, `step`, `mismatch`, `modelLabel` | sections `{field, title, found, content, citations}`; no document name or chat link | A: map sections and flatten citations; B: add `document_name` and `conversation_id` |
| Summary export | Word HTML built in the browser | none | B: `POST /summaries/{id}/export` → .docx working copy; F: download it |
| Draft list | `listDrafts(matterId)` | none | B: `GET /matters/{id}/drafts` |
| Start a draft | `createDraft(...)` from the Start-draft dialog | only through a chat turn in Draft mode | B: `POST /matters/{id}/drafts` → 202 `{draft_id, job_id}` |
| Draft sections | `{id, label, body}` | `{id, heading, content, citations, origin, claim_ids}` | A |
| Draft claims | `claims[{id, text, source, addressedBy, waived}]` on the draft | claims inside the version; status in `GET /checks` (addressed, flagged, missing); no "set aside" | B: `claims` on the draft with `addressed_by` and `waived`; PATCH can set `waived` |
| Addressee and header | `addressee {name, firm, address[], represented}`, `memoHeader {to, from, re}`, `dateLine` | `safeguards.addressee {name, firm, address, email, rule}`; the memo header is a section; no date line | A: `represented` = rule 4.2; B: add `memo_header` and `date_line` |
| Unverified authority (Phase 1) | an `[UNVERIFIED]` row can't be ticked; the lawyer removes the sentence or vouches for it in the letter | the text keeps `[UNVERIFIED: …]`; ticking the row is the lawyer's vouching, and the clean copy then cites it normally | F (INT-3.3): the tick is the vouch, with the DEC-49 note; "Remove the sentence" stays |
| Review gate (Phase 1) | "Review and adopt" is refused while anything else is open | adopted whatever was open; only the clean export was blocked | B, done in Phase 1: 409 `review_blocked` with the open items |
| Accepting a preview (Phase 1) | an accepted rewrite or claim response is saved as an ordinary edit | `accept_proposal` applies the server's stored preview, so its citations stay server-made and the version is marked AI-written | F (INT-3.3): accept by `proposal_id` |
| Letter layout (added 2026-10-10) | the editor draws the date, addressee, Re line and "Dear Counsel:" from the fields above; sections are the body only | the addressee, the Re line and the salutation are sections (`kind` addressee, re, intro; `show_heading`), but `kind` and `show_heading` are not returned | B: return `kind` and `show_heading` on each section; A: head sections go to the letterhead fields, body sections stay sections |
| Draft extras (added 2026-10-10) | `incomingDocumentName`, `modelLabel`, one flat `citations` list, `instructions` | `incoming_document_id` only; no model or prompt version; citations per section (numbered across the whole draft); instructions not stored | A: name from the document list, citations flattened (their `n` is already unique); B: add `model_id` and `prompt_version` to the draft; A: `instructions` left empty |
| Citation checklist | computed in the browser: `[UNVERIFIED]` tokens and lawyer-added authorities; since 2026-10-10 legal authorities only, with no contract-clause rows (decision 1) | computed on the server: legal authorities only (cases, statutes, rules, regulations), four statuses, stable ids | F: read `GET /drafts/{id}/checks` (INT-3.3) |
| Export gate | blocks on placeholders, **unanswered claims not set aside**, unacknowledged rows, no review | blocks on placeholders, unacknowledged rows, no review | B: add the unanswered-claims blocker; decision 2 |
| Lawyer-added authority | `addedAuthorities[]`, sent in PATCH | status `added_by_lawyer` when a lawyer-edited section holds it | B: accept `added_authorities` in PATCH and return them |
| Acknowledgements | keys made in the browser | server item ids (`auth_…`) | F: use the server ids from `/checks` |
| Draft versions | `versions[{version, label, createdAt, sections}]`; PATCH carries `versionLabel` | `versions[{version, source, created_at}]`; older text via `GET ?version=n` | B: store and return a `label`; A: load older text on demand |
| Concurrent edits | none | PATCH needs `base_version`; 409 `version_conflict` | A: send the cached version; F: on 409, reload and tell the lawyer |
| Rewrite a section | a proposal returned without saving, then accepted or rejected | a job that saves a new version with a diff | B: `POST /drafts/{id}/sections/{sid}/propose` → `{body}`; decision 3 |
| Answer a claim | `proposeClaimResponse` returns a new section | none | B: `POST /drafts/{id}/claims/{cid}/propose` → `{section}` |
| Draft export | `{filename, html}`, downloaded as Word HTML | a checked .docx (clean or working copy) | F: download the server's file |
| Draft status | `drafting` | `generating`, plus `failed` | A, and F: show `failed` |
| Errors | thrown `Error` | problem+json with `code`, `request_id` and extras | A: an `ApiError` with status, code and extras; F: microcopy per code |
| Session | an idle lock in the browser with a fixed 30-minute timeout (FE-3.2, built in FE Phase 8) | 401 `session_expired` after 30 min idle | F: the lock screen on 401, and the timeout from `/auth/me` (INT-3.7) |
| Health | `getHealth()`, added in INT-0.3; since FE Phase 8 it drives the banners and Settings › About, matching components by the backend's field names (`orchestrator`, `worker`, `scanner`, `storage`) | `GET /health` | A: done in INT-0.3; F: banners built in FE Phase 8, to be checked against the real backend in INT-3.7 |
| Licensing states (FE Phase 8) | the lawyer edits them in Settings; kept in the browser for now | `user.licensing_states`, read-only | B: an endpoint to change them; F: Settings uses it (INT-3.10) |
| Storage (FE Phase 8) | a `storage` component with free space in `detail`, for the "almost full" banner | none | B: a `storage` component in `/health` (INT-3.10) |
| Model and prompt versions (FE Phase 8) | shown in Settings › About (FE-8.1) | stored on each answer and draft; not in `/health` | B: report them in `/health`; F: About shows them (INT-3.10) |
| AI engine state (FE Phase 8) | `orchestrator.ok` false when the engine can't take work, which pauses every AI action | `orchestrator` is always ok (the stub needs no model) | B, with the real orchestrator (out of scope here): ping the model server; `BACKEND_TODO.md` §10.4 |

---

## 4. Decisions (all approved 2026-10-10)

1. **The server's citation checklist wins.** Rows are legal authorities only: cases, statutes, rules and
   regulations, as DEC-49 describes. The browser's rows for cited contract clauses go; a clause the draft quotes is
   evidence, not authority.
2. **Unanswered claims block a clean export unless set aside.** This is the frontend's rule, added to the server:
   DEC-47 says the draft must answer every point, and RISK-06 covers sending a letter that skips one.
3. **Rewriting a section is a preview.** The lawyer sees the proposal and accepts it (a new version) or rejects it
   (nothing changes), as the frontend designed it. A chat instruction ("make point 2 firmer") keeps saving a version
   straight away, with the diff shown.
4. **Drafts can be started directly** from the Start-draft dialog, as well as from a chat turn.
5. **Summary exports are server-built .docx working copies,** like draft exports (DEC-12). The browser's HTML
   "Word" export goes.
6. **Wire types are generated** from `openapi.json` with `openapi-typescript` (a dev dependency, no runtime code).
7. **Streams:** a run stream is read with `fetch` and a small SSE parser, so Stop can abort it and it can't
   reconnect in a loop after `done`. The matter stream uses `EventSource`, which reconnects with `Last-Event-ID`
   by itself.
8. **Development runs on two ports behind a proxy.** Vite proxies `/api` to `127.0.0.1:8000`, so the browser sees
   one origin, the SameSite=Strict cookie works and there is no CORS. Phase 5 then serves the built app from FastAPI,
   one process on one port, as the TA describes.
9. **`node_modules` moves out of iCloud,** into `node_modules.nosync` with a link, for the same reason the backend's
   virtual environment did.
10. **Stub answers are labelled in the UI.** While `/auth/me` reports `orchestrator: stub`, a small dev badge says
    answers are a stand-in. Real-looking answers must not be mistaken for a model's.

---

## 5. To-do by phase

### Phase 0: Preconditions and setup

- [x] **INT-0.1** Confirm the frontend is frozen (§1) and note the state used: FRONTEND_TODO ticks and file dates.
- [x] **INT-0.2** Move `frontend/node_modules` to `node_modules.nosync` with a `node_modules` link. Check that build,
      unit tests and Playwright still pass.
- [x] **INT-0.3** Vite proxy for `/api` (SSE unbuffered); `VITE_API=mock|http` chosen in `providers.tsx`; a root
      script that starts `legallens dev` and `npm run dev` together.
- [x] **INT-0.4** `npm run api:types` generates `src/api/http/schema.d.ts` from `../backend/openapi.json`; a check
      fails when it is out of date.
- [x] **INT-0.5** Re-run the §3 comparison against the frozen frontend and update the table.

**Demo:** the app runs as before in mock mode. In http mode the sign-in page reaches `/api/v1/health` through the proxy.

> **Done 2026-10-10.**
> - **Freeze (INT-0.1).** FRONTEND_TODO has 41 of 65 tasks ticked. The frozen files are `src/api/types.ts`
>   (2026-10-10 12:06, sha256 `2ba2f2619ac1…`), `client.ts` (10-07, `17a930a64457…`), `events.ts` (10-07,
>   `17e49682161c…`), the nine files in `src/api/queries` (10-06 to 10-07) and `src/lib/drafts.ts` (10-10 12:07,
>   `2408e1ca8100…`). Integration edited `types.ts`, `client.ts` and the mock in INT-0.3 (§7).
> - **node_modules (INT-0.2).** The packages now live in `node_modules.nosync`, linked as `node_modules`. npm
>   replaces that link with a real folder whenever it installs a new package, so `scripts/link-node-modules.mjs`
>   runs after every bare `npm install` and moves it back. `npm install <package>` skips the project's postinstall,
>   so run a bare `npm install` afterwards. Vite keeps the linked paths (`preserveSymlinks`) and doesn't watch the
>   real folder. Playwright needs Node's `--preserve-symlinks` flags to load one copy of itself, so `test:e2e` runs
>   its CLI through `node` with them.
> - **Proxy and switch (INT-0.3).** Vite passes `/api` to `127.0.0.1:8000`. `npm run dev:http` (or
>   `VITE_API=http`) uses the real client, and anything else uses the mock. `scripts/dev.sh` starts the backend
>   and the http-mode frontend together; Ctrl+C stops both. Streaming is not buffered: a 72-token answer arrived
>   with half its tokens by 0.95 s and all by 1.91 s through the proxy, against 0.94 s and 1.92 s direct. Sign-in
>   through the proxy sets `ll_session` on the app's own origin. In development the sign-in page shows which client
>   is in use; against the backend it shows the version, any unhealthy components and "stub answers". The browser
>   tests now run their own mock server on port 5174, so a dev server against the backend on 5173 never answers them.
> - **Wire types (INT-0.4).** `npm run api:types` writes `src/api/http/schema.d.ts` (4,685 lines) with
>   openapi-typescript 7.13.0. A unit test regenerates the types in memory and fails if the file is out of date;
>   it was checked by making the file stale on purpose.
> - **Comparison (INT-0.5).** Two rows changed (citation checklist, health) and two were added (letter layout,
>   draft extras) in §3.
>
> Checks: the frontend's Prettier, typecheck, lint, 49 unit tests, build and 10 Playwright flows all pass, with
> the backend running beside them.
>
> **Follow-up for INT-5.1:** an http-mode production build still contains the mock and its seed data, because the
> seed modules run code when they load and the bundler keeps them. The mock-mode build already leaves out the
> http client.

### Phase 1: Backend additions

Each task ships with tests, a regenerated `openapi.json` and its rows in the TA doc's API reference.

- [x] **INT-1.1** Chat:
    - `searched` on the `answer_state` event and on stored messages
    - `quote` on the `citation` event
    - `job {kind, entity_id}` on stored messages
- [x] **INT-1.2** Matter events:
    - `job.progress` gains `step_code`, `detail` and `summary_id` / `draft_id`
    - `job.done` gains the entity id and its name or title
    - `document.ready` and `document.failed` gain `name`; failures gain `quarantined`
    - the step codes the frontend uses: ingest = checking, scanning, reading, ocr, indexing; summarize = reading,
      extracting, writing, verifying; draft = reading, claims, retrieving, drafting, safeguards, verifying
- [x] **INT-1.3** Lists: `GET /matters/{id}/summaries`, `GET /matters/{id}/drafts`; matter list items gain opposing
      party, opposing counsel, court and practice area.
- [x] **INT-1.4** Viewer: each page block gains `ref` (its clause or ¶ pinpoint). Existing documents need
      re-ingesting, so the dev seed is rebuilt.
- [x] **INT-1.5** Deletion preview gains `conversations`: the chats whose answers cite the document.
- [x] **INT-1.6** Drafts:
    - `POST /matters/{id}/drafts` → 202 `{draft_id, job_id}` (decision 4)
    - the draft gains `claims` (`addressed_by`, `waived`), `acknowledged`, `added_authorities`, `date_line`,
      `memo_header` and a `label` per version
    - PATCH accepts `waived` claims, `added_authorities` and `version_label`
    - `POST /drafts/{id}/sections/{sid}/propose` → `{body}`, and `POST /drafts/{id}/claims/{cid}/propose` →
      `{section}`; nothing is saved until the lawyer accepts (decision 3)
    - the export gate adds unanswered claims not set aside (decision 2)
- [x] **INT-1.7** Summaries: `POST /summaries/{id}/export` → .docx working copy (decision 5); the summary gains
      `document_name` and `conversation_id`.
- [x] **INT-1.8** Update the TA doc ("Backend as built" and the API reference) and `BACKEND_TODO.md` §10.

**Demo:** `uv run pytest` green; `openapi.json` regenerated; curl shows the enriched events.

> **Done 2026-10-10.** All eight tasks are built, each with tests. `openapi.json` now has 49 operations (43 + 6).
> One migration (`0002`) adds the new columns, and a new test checks that the migrations always match the models.
> - **Chat (INT-1.1):** the `citation` event carries its `quote`. `answer_state` and stored messages carry
>   `searched` (scope, rewritten question, documents searched, passages reviewed and passages used, which is 0 when
>   nothing passed the gate). Stored messages carry `job {kind, entity_id}`.
> - **Matter events (INT-1.2):** `job.progress` has `step_code`, `detail` and the `summary_id` or `draft_id`;
>   `job.done` has `entity_id` plus `document_name` or `title`; document events have `name`, and failures say
>   `quarantined`. A file quarantined at upload now also announces itself on the stream. Ingest step codes are
>   checking, reading, ocr and indexing; the malware scan happens at upload, before the job, so it has no step.
> - **Lists (INT-1.3):** `GET /matters/{id}/summaries` (optionally one document's) and `GET /matters/{id}/drafts`,
>   newest first, as light list items. Matter list items gain `court`, `practice_area`, `opposing_party` and
>   `opposing_counsel`. Summaries now remember the chat that asked for them.
> - **Viewer (INT-1.4):** each page block has `ref`, the same pinpoint its citations carry. The dev seed was rebuilt.
> - **Deletion (INT-1.5):** the preview counts `conversations`, the chats whose answers cite the document.
> - **Drafts (INT-1.6):** `POST /matters/{id}/drafts`; previews for a section rewrite and for a claim response,
>   applied only by `PATCH accept_proposal` (a preview made before another change is refused as stale, and the
>   newest 20 are kept); claims with `status`, `addressed_by` and `waived`; `acknowledged` (and `unacknowledge` in
>   PATCH); `added_authorities`; `date_line`; `memo_header`; `model_id` and `prompt_version`; a `label` per
>   version; and `kind` and `show_heading` on each section. The export gate adds unanswered claims (decision 2).
> - **Summaries (INT-1.7):** `POST /summaries/{id}/export` returns a .docx working copy with its sources, stamped
>   privileged; the summary gains `document_name` and `conversation_id`.
>
> Three behaviour changes came from re-reading the frontend's rules (§7): the server refuses "Reviewed and
> adopted" while anything else is open, a safeguards change after adoption un-adopts the draft, and draft exports
> print the draft's own date line. Checks: 127 tests by default plus 2 slow ones, 90% line coverage, ruff and mypy
> clean. The isolation test now covers every draft endpoint, which it didn't before. A live run against the
> reseeded dev database checked every addition (§7, Phase 1, entry 10). The frontend's drift test (INT-0.4)
> failed on the new contract, as designed, until `npm run api:types` regenerated `schema.d.ts`; the frontend's
> checks then passed again.

### Phase 2: The real client

- [x] **INT-2.1** Request layer:
    - base `/api/v1`, same-origin cookies, JSON
    - problem+json becomes an `ApiError` with status, code, detail, extras and request id
    - a 401 goes to the session store, which shows sign-in or the lock screen
- [x] **INT-2.2** Mappers from wire types to view models: user, matter, conversation, message, citation, document,
      coverage, page, summary, draft, job and every event. They are pure functions with unit tests on fixtures
      recorded from the real backend.
- [x] **INT-2.3** Auth: `signIn`, `verifyMfa`, `getMe`, `signOut`.
- [x] **INT-2.4** Matters (including create, edit, close, export, delete), chats and messages, with a helper that
      walks cursors.
- [x] **INT-2.5** `sendMessage`: creates the chat when needed; one Idempotency-Key per send, reused on retry; maps the
      options.
- [x] **INT-2.6** `streamRun`:
    - `fetch` with an SSE parser
    - on a dropped connection, resume with `Last-Event-ID`
    - close on `done` or `error`
    - Stop = abort + `POST /runs/{id}/cancel`
- [x] **INT-2.7** `subscribeMatterEvents`: `EventSource`, resumes with `Last-Event-ID`, maps events, closes when the
      matter closes.
- [x] **INT-2.8** Documents:
    - upload with `XMLHttpRequest`, for real upload progress; the server's errors map to the dialog's messages
    - list, viewer pages, deletion preview (dry run), delete
    - hidden content as the deliberate step
- [x] **INT-2.9** Summaries: list, get, create, export (download the file).
- [x] **INT-2.10** Drafts:
    - list, get (older versions on demand), create, update with `base_version`
    - a 409 `version_conflict` reloads and tells the lawyer
    - propose a rewrite or a claim response, review
    - checks, export (download the file)
- [x] **INT-2.11** Contract tests: every `HttpApiClient` method runs against recorded responses. `npm run
      api:fixtures` re-records them from a freshly seeded backend.

**Demo:** in http mode, sign in, open Smith v. Acme Corp and see its real documents, chats and coverage reports.
**Done 2026-10-10:** checked in a browser against a freshly seeded backend.
**Deviations from the plan (Phase 2):**

- Backend, found while mapping: matter list rows carry `our_side`, document list rows carry `coverage`, and `job.failed` carries the summary or draft id. 127 backend tests pass.
- `job.failed` is now a `MatterEvent` (toast and refresh in `useMatterEvents`), and draft `status` gained `failed`: a failed job otherwise stayed on "processing".
- The interface is unchanged. Upload with bytes, file exports, sign-out and cancel-run are extras on the client (`uploadFile`, `exportDraftFile`, `exportSummaryFile`, `signOut`, `cancelRun`). The interface's `uploadDocument` and `exportDraft` throw until INT-3.2 and INT-3.4.
- Saves send only changed sections plus the `base_version` seen; a section equal to a held preview is sent as `accept_proposal`. Letter head and sign-off text is cut for display and put back on save.
- After sign-in, http mode goes to the matters list (the mock still goes to `/m/smith`).
- Not mapped, no server data: summary `mismatch`, draft `instructions`.
- Tests: 41 unit tests on fixtures from `npm run api:fixtures`. One unit test failed once during an overlapping server shutdown and passed three times after; cause not found.


### Phase 3: Frontend changes where behaviour differs

- [x] **INT-3.1** Interface (`client.ts`, and the same changes in `MockApiClient`):
    - upload takes a `File`; exports return a `Blob` and a file name
    - new methods: matter admin, sign-out, feedback, cancel run, citation lookup, hidden content, job status and
      cancel, audit, health, draft checks *(2026-10-10: also `updateLicensingStates`. Matter admin is methods only; the FE-3.8 and FE-3.9 dialogs are still stubs.)*

- [x] **INT-3.2** Upload dialog: the browser check (type, size, duplicate hash) stays as an early hint; the server's
      answer is final, including the malware scan's 422 and 503. *(2026-10-10: the dialog sends the `File` and shows the server's message with its reference.)*

- [x] **INT-3.3** Drafts read their checks from the server: CitationChecklist, ChecksTab, ExportMenu, ReviewDialog and
      DraftJobCard use `GET /drafts/{id}/checks`. `lib/drafts.ts` keeps display helpers only (tokens, diff, preview
      text). *(2026-10-10: the mock's checklist and gate moved to `src/api/mock/draftChecks.ts`.)*

- [x] **INT-3.4** Exports download the server's .docx for drafts and summaries. `lib/exportWord.ts` goes. *(2026-10-10: the mock's Word HTML moved to `src/api/mock/exportWord.ts`; files are named by the server.)*

- [x] **INT-3.5** Hidden-content notice: kinds and count first; "View hidden content" calls the audited endpoint. *(2026-10-10: the notice shows the count and kinds from the document; the items come from the endpoint after the confirm step.)*

- [x] **INT-3.6** Viewer: the cited block is highlighted by its `ref`. Page boxes are used once PDF.js arrives
      (FE-5.6). *(Already done by the Phase 2 mapper: `anchor` is the block's `ref`. Page boxes wait for PDF.js.)*

- [x] **INT-3.7** Session: the idle timeout comes from `/auth/me`; a 401 shows the lock screen (FE-3.2); `/health`
      drives the banners (FE-8.3). *(2026-10-10: `useMe` carries `idleTimeoutMs`; SessionGuard follows it.)*

- [x] **INT-3.8** Each problem `code` maps to the microcopy in FRONTEND_TODO §2.4. Errors keep their request ID for
      support. *(2026-10-10: `lib/errors.ts`; the status-based "may have been deleted" check in §7 Phase 9 note 2 is not yet replaced.)*

- [x] **INT-3.9** The dev badge for stub answers (decision 10). *(2026-10-10: a "Stand-in answers" pill in the top bar while `/auth/me` reports `orchestrator: stub`.)*

- [x] **INT-3.10** *Added 2026-10-10 after frontend Phase 8; approved by the owner the same day.* Backend: an endpoint to
      change the user's licensing states, and a `storage` component plus the model and prompt versions in
      `/health`. Frontend: Settings saves licensing states to the server (moving any kept in the browser), and About
      shows the versions. Rows marked "FE Phase 8" in §3. *(2026-10-10: `PATCH /auth/me`, `storage` in `/health`, versions in the engine's detail; 50 endpoints.)*

**Demo:** every main flow works against the real backend.

### Phase 4: End-to-end proof

- [x] **INT-4.1** A Playwright project named `real`. It starts the backend (a temp data folder, the fast converter,
      no scanner, no streaming delay), seeds it, and runs the frontend in http mode through the proxy. *(2026-10-11: `npm run test:e2e:real`; `e2e-real/backend.mjs` starts the backend on 8100 in a temp folder with the machine's clamd, the app on 5175. Needs `uv` and a running clamd, else it starts without a scanner and uploads show as paused.)*
- [x] **INT-4.2** Flows:
    1. sign in (both steps)
    2. open a matter
    3. upload 3 samples and watch them ingest
    4. ask, open a citation and see the passage highlighted
    5. get a not-found answer and an outside-law answer
    6. summarize the demand letter and export it
    7. start a draft from the demand letter
    8. fill placeholders, answer or set aside every claim, acknowledge the checklist, review, export clean
    9. delete a document, then delete the matter *(2026-10-11: `e2e-real/flows.spec.ts`, 10 serial tests. Flow 5 asks a weather question for not-found and an enforceability question for outside-law. Found and fixed: the frontend ignored `[PLACEHOLDER: …]` tokens; the letter's sign-off carried `[ATTORNEY NAME]`/`[FIRM NAME]` that the screen hides but the server counts, so the backend now signs with the matter owner's name.)*
- [x] **INT-4.3** The same flows still pass in mock mode. *(2026-10-11: 52 mock-mode tests pass, including the new matters spec.)*
- [x] **INT-4.4** Leak check from the UI: with two matters, one matter's screens never show the other's documents,
      chats or citations. *(2026-10-11: flow 9 of the real project.)*
- [x] **INT-4.5** axe accessibility checks on the real-data screens. *(2026-10-11: axe runs on the real-data screens in flows 2, 3, 4, 6, 7, 8 and 9.)***Demo:** both Playwright projects are green.

### Phase 5: One app

- [x] **INT-5.1** FastAPI serves the built frontend from the same origin, with an SPA fallback and cache headers.
      `legallens serve` is then the whole app on `127.0.0.1:8000`. *(2026-10-11: `backend/src/legallens/web.py`; `npm run build:app`, then `legallens serve --worker`. An http build carries no mock code. `npm run test:e2e:single` runs the 10 flows against it: 10 of 10.)*
- [x] **INT-5.2** A root `README.md`: how to run both sides in development and the single app. *(2026-10-11: `README.md` at the repo root.)*
- [x] **INT-5.3** Update the TA doc, `BACKEND_TODO.md`, `FRONTEND_TODO.md` (FE-2.1 and FE-2.2 are covered here) and
      the IDEAS.md entries for the decisions in §4.

**Demo:** one command opens LegalLens at `127.0.0.1:8000` and the end-to-end flows pass against it.

---

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| Two sessions edit the frontend's API layer at once | Precondition 1: freeze it first; integration owns `src/api` and `lib/drafts.ts` until Phase 3 ends |
| The contract drifts again while work goes on | Generated wire types, the backend's `openapi.json` drift test, recorded-response contract tests |
| SSE through the Vite proxy is buffered or compressed | Configure the proxy for streaming in INT-0.3; check token-by-token arrival in INT-4.2 |
| Stub answers look like a model's | Decision 10: a visible badge while the orchestrator is the stub |
| Viewer anchors change after INT-1.4 | Rebuild the dev seed; real documents are not used yet (DEC-73) |
| The draft model is the largest change | Phase 1 adds what drafts need first; Phase 3 moves the rules to the server one screen at a time, each with its test |

---

## 7. Decision and change log

Every change to this plan after approval, and every decision it left open, with the date and the reason. Newest
first.

### 2026-10-11 · Phases 3 to 5

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | The owner asked for the FE-3.8 and FE-3.9 matter dialogs before Phase 4. They are built, and matter admin was added to the interface in INT-3.1. | The end-to-end plan's flow 9 (delete a matter) needs them. |
| 2 | Added to Phase 3 scope: `updateLicensingStates` (INT-3.10) and a `storage` health component. | Settings and the banners needed them. |
| 3 | The real end-to-end run found two contract gaps: the screen ignored `[PLACEHOLDER: …]` tokens, and the letter's sign-off carried `[ATTORNEY NAME]`/`[FIRM NAME]` that the screen hides and the server counts. The token grammar was aligned, and drafts are signed with the matter owner's name. | Only a run against the real backend could show them. |
| 4 | The `real` project starts the machine's clamd scanner rather than none: with no scanner the UI correctly pauses uploads. | The scanner's state is part of what the screens react to. |
| 5 | The worker stays opt-in on `serve` (`--worker`). A supervised on-demand worker was discussed and left out. | The owner chose to keep it as is (2026-10-11); BACKEND_TODO §10.6 records the option. |
| 6 | INT-5.3 is done for the repo's own plans and IDEAS.md (DEC-74 to DEC-78). The TA doc and its frames 2 and 7 are not yet updated. | They are a separate, larger pass; see the check-in with the owner. |

### 2026-10-10 · Frontend Phase 9 notes

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | Frontend Phase 9 did not edit the frozen API layer. It changed only screens, the mock and the tests. | The freeze holds until Phase 3 ends. |
| 2 | The screens now tell a failed load from a deleted item by checking the matter's list. INT-3.8 should replace that check with the server's 404, once errors carry a status and `code`. | A failed load was being reported as "may have been deleted" (`FRONTEND_TODO.md` §10, Phase 9, entry 14). |
| 3 | FE-9.5's "delete a matter" flow is left to INT-3.1 (the matter methods) and INT-4.2 flow 9, with FE-3.9's dialogs. | The frozen client has no method to delete a matter. |
| 4 | The production build still carries the mock, now including its outage switch's message; the dev panel itself stays out. INT-5.1 should drop the mock from the single-app build. | As noted after Phase 8; checked again on the Phase 9 build. |

### 2026-10-10 · Frontend Phase 8 findings

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | Frontend Phase 8 built the banners, the session lock and Settings without editing the frozen API layer. Their system state comes from `getHealth()`, matching components by the backend's field names. | The freeze (§1, precondition 1) holds until Phase 3 ends. Checked: `events.ts` and `lib/drafts.ts` match their freeze hashes, and the other frozen files last changed in this plan's Phase 0. |
| 2 | Four §3 rows added, marked "FE Phase 8": licensing states, storage, model and prompt versions, and the AI engine's state. | Settings and the banners need data the backend doesn't serve yet. The frontend uses its own stand-ins for now (licensing states in the browser; storage and versions only in the mock), logged in `FRONTEND_TODO.md` §10. |
| 3 | INT-3.10 closes the first three rows. The owner approved it on 2026-10-10, after the Phase 8 demo. | They are small backend additions, but this plan's scope was approved without them, so the owner decided. |
| 4 | The AI engine row is left to the real orchestrator, which is out of scope here, and noted in `BACKEND_TODO.md` §10.4. | The stub has no model server to ping. Until then the engine-offline state shows against the real backend only when LegalLens itself isn't answering. |
| 5 | A production build still contains the mock client and its seed data, including the dev controls' messages; the dev panel itself is excluded. | The client is chosen at run time from `VITE_API`. INT-5.1 should leave the mock out of the single-app build. |

### 2026-10-10 · Phase 1

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | Previews are kept on the draft and applied with `PATCH accept_proposal`, rather than the screen sending the accepted text back as an edit. The newest 20 are kept, and one made before another change is refused as stale. | The preview's citations stay server-made, and the version is marked AI-written. Sent back as an edit, AI text would count as the lawyer's, which changes its checklist status. |
| 2 | The server refuses "Reviewed and adopted" while placeholders, unanswered points or unacknowledged citations remain (409 `review_blocked`). | The frontend already refused it, and under principle 1 the server owns the rule. Found while reading the review code; the 2026-10-07 table missed it. |
| 3 | A safeguards change after adoption returns the draft to "not reviewed". | The FRE 408 header and the reservation of rights are part of the letter that goes out (DEC-51); the frontend's mock already did this. |
| 4 | Draft exports print the draft's stored date line instead of the export day. | The editor shows the date line, and the Word file must match it. |
| 5 | Sources the lawyer names become checklist rows only when they are legal authority; others are stored and returned but not listed. A named authority the other side's letter already cites keeps the more telling status "only mentioned". | Decision 1: the checklist is for legal authority. |
| 6 | PATCH also takes `unacknowledge`. | The frontend lets a tick be undone. |
| 7 | A file quarantined at upload also emits `document.failed` with `quarantined: true`. | Every screen learns of it the same way, not only the upload dialog. |
| 8 | Summaries store `conversation_id`, and exports store `summary_id`. | The summary list and the export record need them. |
| 9 | The isolation test now covers every draft endpoint and the new list, export and create endpoints. A test now checks that migrations match the models. | It covered no draft endpoints before, and nothing caught a model change without a migration. |
| 10 | Live check against the reseeded dev database. A cited passage (MSA 4.2(b)) streamed its quote, and the answer reported 6 documents searched, 18 passages reviewed and 8 used. The viewer block for page 1 carried the same ref. The deletion preview counted 3 citing chats. The summary and draft jobs reported exactly the frontend's step codes, and `job.done` named the document and the draft title. A draft had its date line, model label, 6 claims and a version label. A rewrite preview left the draft at version 1. Review was refused with `placeholders` and `unacknowledged_citations`. The summary exported as a .docx. | Proof that the additions work outside the test suite. |

### 2026-10-10 · Phase 0

| # | Decision or change | Why |
| --- | --- | --- |
| 1 | A `postinstall` script restores the `node_modules` link after each install, and `test:e2e` runs Playwright with Node's `--preserve-symlinks` flags. | Decision 9's link doesn't survive npm: npm replaced it with a real folder on the first package install. Without the flags, Playwright loads two copies of itself through the link. |
| 2 | `openapi-typescript` 7.13.0 is pinned, with an npm `overrides` entry that lets it use the project's TypeScript 6. | Its latest release declares support for TypeScript 5 only. The generated file typechecks under TypeScript 6, and the drift test guards it. This is narrower than turning off peer checks for every package. |
| 3 | `getHealth()` was added to `ApiClient` and the mock in Phase 0, ahead of INT-3.1. | The Phase 0 demo needs the sign-in page to reach `/health`, and screens may only talk to the backend through the interface. |
| 4 | The browser tests run their own mock dev server on port 5174. | `scripts/dev.sh` serves the http-mode app on 5173; Playwright would otherwise reuse it and test the backend instead of the mock. |
| 5 | The run script is `scripts/dev.sh` in bash, not a Node package such as `concurrently`. | No new dependency for two commands; it uses only the bash in macOS. |
| 6 | The owner approved all ten decisions in §4, unchanged, and decision 1 was applied to the mock before the freeze. | See FRONTEND_TODO.md §10, 2026-10-10. |
| 7 | Phase 0 started before frontend Phases 8 and 9, on the owner's go-ahead of 2026-10-10. On 2026-10-07 the owner had put integration on hold until the whole frontend was complete; that came to light after Phase 0 and was raised with the owner before Phase 1. | Phase 0 changes tooling only: the app still defaults to the mock. Whether Phase 1 goes ahead now is the owner's call. |
| 8 | The owner decided on 2026-10-10 to continue with integration Phase 1, then return to frontend Phases 8 and 9. | It replaces the 2026-10-07 hold. |

