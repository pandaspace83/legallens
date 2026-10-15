# LegalLens Closeout: pending items before the end-to-end test

> **Status:** Approved 2026-10-14 (security slice included) · All phases done 2026-10-14 · **Goal:** nothing pending, then one full
> end-to-end run that shows which layer answers each step and what the LLM contributes.
> IDs: `CL-<phase>.<n>`. Each phase ends with a check you can run.

## Phase 1: Frontend loose ends (FRONTEND_TODO partly-done items)

- [x] **CL-1.1** Triage the 11 unticked FE tasks against the code: tick what is done (FE-8.1 model and prompt
      versions, FE-9.5 Playwright flows are probably done), list what is really missing.
- [x] **CL-1.2** Message actions: feedback form (Helpful / Wrong citation / Missed something / Should be not found,
      optional note, `POST /messages/{id}/feedback`) and Retry (FE-4.8).
- [x] **CL-1.3** Cancel button on summary and draft job cards (`POST /jobs/{id}/cancel`) (FE-4.10).
- [x] **CL-1.4** Viewer: previous / next citation (FE-5.6).
- [x] **CL-1.5** Context panel: resizable, remembers its width (FE-3.6).
- [x] **CL-1.6** `Select` and `Textarea` primitives, and the `/dev/ui` gallery (FE-1.2, FE-1.4). Dev only.
- [x] **CL-1.7** Thread virtualisation (FE-4.9): only if a 200-message thread is measurably slow; otherwise record
      "not needed" with the measurement.
- [x] **CL-1.8** Skip as mock-only and close with a note: `localStorage` persistence and the dev-panel event log (FE-2.6).

**Check:** `npm test`, `npm run test:e2e` (mock) and `npm run test:e2e:real` pass; FRONTEND_TODO has no open box
without a written reason.

## Phase 2: Backend and AI loose ends

- [x] **CL-2.1** Real streaming for Ask: stream tokens from Ollama, verify at the end, and replace the streamed text
      with the checked text if verification changes it (first words in about 1 s instead of 24 s).
      *Done 2026-10-14: tokens stream as written; `answer_text` replaces them with the checked text. First words in ~0.5 s warm.*
- [x] **CL-2.2** Move the relevance gate onto the reranker score (EMBEDDINGS_TODO D5), after a small benchmark on
      the sample documents and the 11 questions.
      *Done 2026-10-14: reranker score gate with keyword rescue (GATE_BENCHMARK.md, 14/14 answerable, 10/10 unanswerable).*
- [x] **CL-2.3** Trim the bge-m3 download (EMBEDDINGS_TODO follow-up).
      *Done 2026-10-14: ONNX copy and README images no longer downloaded; models folder 6.4 GB to 4.2 GB.*
- [x] **CL-2.4** Golden-set benchmark v1 (DEF-01): about 30 questions across the sample documents, answer, summary
      and draft scored automatically; one command, one table. Replaces the provisional model choice.
      *Done 2026-10-14: GOLDEN_SET.md, 34 questions, both models 23/24 correct, 10/10 not found, 0 invented.*
- [x] **CL-2.5** Summary map-reduce for documents over the context size (50-page target, DEC-14), measured on a
      generated 50-page document.
      *Done 2026-10-14: 14B took 598 s, so documents over 20 pages use the 7B (204 s, figure on page 37 found; DEC-89).*
- [x] **CL-2.6** Decide, and record as DEC entries: LLM intent router (build or keep keywords), query analysis
      (build or drop), NLI verifier (build or keep rule-based). Default recommendation: keep the simpler version.

**Check:** `pytest` (default and `-m llm`) pass; benchmark table in `MODEL_COMPARISON.md`.

## Phase 3: Security slice (owner decision needed: in or out)

      *Done 2026-10-14: keep the keyword router, no query analysis, rule-based checker (DEC-85).*
- [x] **CL-3.1** Real sign-in: argon2id passwords, TOTP enrolment, lockout, CSRF header (DEC-54), no dev session in
      production mode.
      *Done 2026-10-14: argon2id, TOTP, lockout, CSRF header, `legallens user ...`; tests in tests/security/test_real_auth.py.*
- [x] **CL-3.2** SQLCipher with sqlite-vec (the open spike), fallback: encrypted volume.
      *Done 2026-10-14: SQLCipher 4 + sqlite-vec + FTS5 verified; `legallens db encrypt`; tests in test_encryption.py.*
- [x] **CL-3.3** Encrypted file store (DEC-57) and encrypted backup with a tested restore (DEC-61).

**Check:** security tests (leak, hygiene, outbound) pass with encryption on; restore test passes.

## Phase 4: Documentation and closure

      *Done 2026-10-14: sealed files, `backup create/verify/restore`, `key show`; restore test passes.*
- [x] **CL-4.1** Check the TA doc's API reference tab against `backend/openapi.json`; fix differences.
- [x] **CL-4.2** Tech-stack status chips (models: Open → Provisional or Decided after CL-2.4).
- [x] **CL-4.3** IDEAS.md: add the pending DEC entries (SQLite only; hand-written orchestrator over Ollama; local
      models; backend decisions of 2026-10-06/07; local-only AI rule) without renumbering (INT-5.3).
- [x] **CL-4.4** Tick BACKEND_TODO, FRONTEND_TODO, INTEGRATION_TODO (INT-5.3).
- [x] **CL-4.5** BRD pass: does the 5-page BRD still describe what was built? List differences, edit on approval.
- [x] **CL-4.6** Audit document: BRD requirement → built → test that guards it → status, one table, written last.
- [x] **CL-4.7** Re-export the TA doc local `.md` and the frames once more if Phases 2 or 3 changed them.

## Phase 5: Full end-to-end run

- [x] **CL-5.1** Add a trace to each step (layer, component, model, time, tokens) into the run's retrieval trace,
      and a `legallens trace <message_id>` view if the existing trace is not enough.
- [x] **CL-5.2** One scripted session on the sample matter with real models: upload, ask (found, not found,
      outside law), summarize, draft, refine, export. Capture per step: which layer ran, what the LLM added versus
      the retrieval and checker, and the time.
      *Done 2026-10-14: 27 UI cases against the real backend and local models, 27/27 pass; test-evidence/LegalLens_E2E_Test_Results.xlsx.*
- [x] **CL-5.3** Write the result as a short table in the audit document and fix what it exposes.

## Order and cost

Phase 1 and 2 are code, about a day each. Phase 3 is the largest (several days) and is the one the owner decides.
Phase 4 is last by the project's rule that documentation is the final step. Phase 5 follows 1 to 4.

## Closing notes (2026-10-14)

- CL-4.2: the tech-stack status chips are dropdown chips the tools cannot edit; the cell text says "provisional".
- CL-4.5: the BRD itself needs one sentence in FR-DRF-05 (the memo has no model-written text); not edited, see
  AUDIT_BRD_vs_BUILT.md §5.
- CL-5.1: the stored retrieval trace and the message record (model, prompt version, tokens, latency, rewritten query,
  hits, gate score) were enough; the UAT workbook's "Backend evidence" sheet shows them per case. No new CLI.
- INT-5.3 is closed with this phase.

## Follow-up, 2026-10-15

Edited the BRD (FR-DRF-05), switched Ask to the 7B (DEC-90) and built the remaining "not built" items: model-written
Statement of Facts for memos (DEC-92), HTTPS on localhost, the incident plan, 35-day backup pruning, the release gate
script and the feedback export (DEC-91). Open: a CI service to run the gate on every push (there is no remote), a
lawyer's review of the golden set (OPEN-01), and the BRD page count (not re-measured after the one sentence added).

## CI, 2026-10-15

Repository created (private, `pandaspace83/legallens`) and `.github/workflows/ci.yml` runs backend, frontend and
API-contract jobs on every push; all three green on the first corrected run. The golden-set gate stays local
(`scripts/release_gate.sh`) because it needs Ollama.

## Golden-set gate in CI, 2026-10-15

`.github/workflows/golden-gate.yml` runs on a self-hosted runner (`~/actions-runner` on the owner's Mac, label
`ollama`) nightly, on demand and on pushes that touch the answering code. First green run after fixing a variable
shadowing bug the gate itself caught. The runner must live outside `~/Desktop` (macOS blocks background services
there). Remaining: a lawyer's review of the golden set (OPEN-01) and re-measuring the BRD page count.
