# LegalLens Phase 2: Claude-native, guided step by step

> **Status:** Draft 2026-10-23, waiting for your go-ahead on Step 1 · **You build, Claude guides.**
> IDs: `CN-<phase>.<n>`. Decisions: DEC-94 (Claude behind a setting), DEC-95 (public or synthetic documents only, ask
> before any upload), DEC-96 ($5 cap) in [IDEAS.md](IDEAS.md). Learning goals and scores: [LEARNING_JOURNAL.md](LEARNING_JOURNAL.md).

## Why Claude-native

Faster responses (the 14B local model takes about 11 minutes to summarize 10 pages) and less maintenance (no local
models, GPU or Ollama setup to keep working, tune and re-test). Quality is compared against the local baseline in CN-2.6.

## How we work

- **One step at a time.** Claude says what to build, why it matters for the exam objective, and the check that proves
  it. You write the code. Claude reviews your diff, runs the checks and points at gaps; it writes code only when you
  ask for it.
- **A step is done when** its check passes and you can explain it without notes. Claude drafts the journal entry; you
  write "In my own words".
- **Spending is gated.** Every step that calls Claude states its estimated cost first and waits for your yes.
- **Local stays the default.** Claude is a provider behind a setting, so the 250 fast tests and CI never need an API key.

## Phase A: Claude Code configuration (journal Topic 1)

- [ ] **CN-1.1** Read the `CLAUDE.md` draft Claude wrote. Delete or rewrite every line you can't explain. Replace the
      copied commands with an `@import` of `backend/README.md`, then add `backend/CLAUDE.md` and `frontend/CLAUDE.md`
      holding rules only for those folders. *Check:* run `/memory` and see exactly which files loaded; explain user vs
      project vs folder scope in your own words.
- [ ] **CN-1.2** Add one path-scoped rule in `.claude/rules/` (for example, rules that apply only to `tests/slow/`), one
      project slash command (for example `/golden` to run the golden gate), and one hook (for example ruff after each
      Python edit). *Check:* each fires when expected, and you can say why a hook beats a line in `CLAUDE.md`.
- [ ] **CN-1.3** Do one small change in plan mode and one with the Explore subagent. *Check:* you can say when each
      helps.

## Phase B: Claude behind LegalLens (journal Topic 2)

- [ ] **CN-2.1** *(You, in the console.)* Create an API key for this project only, set a **$5 spend limit** with the
      provider, and store the key outside the repo (never in a file Git sees; gitleaks is watching). *Check:* a one-line
      call from a scratch script returns text and shows `usage` tokens.
- [ ] **CN-2.2** Add the `anthropic` package and a setting `llm_provider = local | claude`. Write `ClaudeChat` in
      `models/llm.py` implementing the same `ChatModel` protocol (`complete` and `stream`), returning the real token
      counts. Models: `claude-haiku-5-5` first, `claude-sonnet-5-5` second. *Check:* a unit test with a fake client
      passes; with the setting at `local`, nothing changes and the fast suite is green.
- [ ] **CN-2.3** The cost guard (DEC-96): a price table, the cost of each call from its tokens, a running total that
      survives restarts, a warning at 80% and a refusal at $5. *Check:* tests with fake usage prove it refuses at the
      cap and never calls out once the cap is hit.
- [ ] **CN-2.4** DEC-94 plumbing: make the no-outside-connection test provider-aware, update "Where your data goes",
      and record the provider in the matter's AI-consent record. *Check:* the test fails if any other address is
      contacted.
- [ ] **CN-2.5** First real call: one Ask on the Iowa opinion with Haiku. Claude asks you to confirm the document
      first (DEC-95) and states the cost. *Check:* a correct cited answer, the cost recorded, and the running total
      matches what the console shows.
- [ ] **CN-2.6** `MODEL_COMPARISON` v2: the 37-question Ask set on qwen 7B, Haiku and Sonnet for accuracy, latency and
      cost, with a recommendation you'd defend to a managing partner. Claude states the estimated cost; thinking
      tokens bill as output, so the guard decides when to stop. *Check:* the table, plus the total spent.

## Phase C: Structure, caching and batches (journal Topics 2 and 3)

Outline only; detailed steps once Phase B is done.

- [ ] **CN-3.1** Intent router on Haiku with structured output (the router reads only the message, DEC-25).
- [ ] **CN-3.2** Prompt caching for summary fields (they share one document; the same idea made local summaries slow).
- [ ] **CN-3.3** Message Batches for the golden runs (half price).
- [ ] **CN-3.4** Extraction with a schema, retry on validation errors, and per-field accuracy.

## Phase D: CI/CD and Azure

Outline only; decide after Phase B, within the $5 total.

- [ ] **CN-4.1** CI: the fast suite stays key-free. Claude-backed golden runs move to a scheduled or manual workflow
      that reads the key from a secret and stops at the spend cap.
- [ ] **CN-4.2** Azure: first a **budget alert** at $5; then decide the smallest honest deployment (a single-replica
      container, since SQLite allows one writer; AKS is not needed). Nothing is created until you confirm.
- [ ] **CN-4.3** Secrets in a key vault, a container build in CI, and a deploy step you can roll back.

## Carried over

- [x] Summary tuning, 2026-10-23: keep 10 passages per field. Fewer lose correctness on the Iowa opinion (6/6, 5/6, 4/6
      at 10, 6, 4 passages) for 24% and 43% less time. See `GOLDEN_SUMMARY.md`.
- [ ] Long-document summaries on the 7B are weak (Mata 3 to 4 of 6 fields right at every setting): it summarizes the
      decisions the opinion quotes. Compare against Claude in CN-2.6.
- [ ] A lawyer's review of the golden set (OPEN-01).
- [ ] Mata court and judge questions (a model limit on the 7B; a good first comparison for CN-2.6).
