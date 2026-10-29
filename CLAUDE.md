# LegalLens

An AI assistant for one solo lawyer: **Ask** questions of uploaded documents, **Summarize** a document, **Draft** a
response letter or memo. FastAPI + SQLite backend, React frontend, local models through Ollama. Being converted to a
Claude-native system for faster responses and less maintenance than running local models; see the journal rule at the bottom.

Decisions live in [IDEAS.md](IDEAS.md) (`DEC-nn`, never renumbered). Architecture: [architecture/](architecture/)
(start with `LegalLens_EndToEnd_Map.md`). Tests by hand: [test-evidence/HUMAN_TEST_CHECKLIST.md](test-evidence/HUMAN_TEST_CHECKLIST.md).

## Rules that always apply

- **Documents (DEC-95).** Only public or synthetic documents ever reach Claude. Before any document is uploaded to
  LegalLens while Claude is enabled, ask the owner to confirm it: name the file and where it came from. This covers
  my own test uploads.
- **Money (DEC-96).** New spend is capped at $5 in total (Claude calls plus any cloud). Say the estimated cost before
  running anything that calls Claude, and never run it in a loop or on every change.
- **Confidentiality.** No client or document text in logs, errors or test output (DEC-68). Every query on client data
  carries `matter_id` (DEC-53); never bypass the scope guard. Model calls go through `models/llm.py` only.
- **Git.** Commit or push only when asked. Never `git add -A` blindly: look at `git status` first.
- **Plan first.** For a new phase or a large change, write or update a `*_TODO.md` and wait for a go-ahead.

## Commands

Per-folder commands are in `backend/CLAUDE.md` and `frontend/CLAUDE.md`, which import their READMEs. Whole-repo:

- `scripts/dev.sh` starts the API (with an in-process worker) and the frontend together (http://localhost:5173; dev
  sign-in is `lawyer@legallens.local`, any password, any six digits).
- `scripts/release_gate.sh` is the release check: suites, golden set, compare with `golden_baseline.json`.

## Where things are

- `backend/src/legallens/`: `api/v1` routes, `services/`, `orchestrator/` (`stub` router and Ask flow, `local` model
  steps, `prompts.py` versioned), `ingestion/`, `search/` (FTS5 + sqlite-vec, rerank), `jobs/` (worker, handlers),
  `drafting/`, `models/` (LLM gateway, embedder, reranker), `db/`.
- Golden sets: `GOLDEN_SET.md` (Ask), `GOLDEN_REAL_IOWA.md` and `GOLDEN_REAL.md` (real opinions), `GOLDEN_SUMMARY.md`
  (summaries). They guard quality; a change that lowers one needs a reason.

## Things learned the hard way

- macOS: `sed -i ''` needs the empty string. The repo sits on the Desktop, so the CI runner lives outside it.
- More lessons are in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Learning journal

LegalLens is being converted from local models to a Claude-native system, and each step is logged in
[LEARNING_JOURNAL.md](LEARNING_JOURNAL.md).

When you finish implementing a Claude-native topic from its Topic map, or a meaningful slice of one:

1. Add an entry at the top of the Daily log, using the journal's entry template.
2. Update that topic's "Learnings" line in the Topic map.
3. Change a score in the Score register and the Scoreboard only where new evidence in the repo (a file, a test or a
   commit) supports it, and name that evidence in the register.
4. Leave "In my own words" blank. I write that line myself.
