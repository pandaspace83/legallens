# LegalLens

A local-first assistant for lawyers: ask questions of a matter's documents with cited answers, summarize them, and draft replies the lawyer reviews and adopts. Everything runs on one computer; nothing leaves it (DEC-08).

> **Synthetic documents only (DEC-73).** Sign-in runs in dev mode by default, and answers come from local models through Ollama. Don't put real client documents in yet.

**How it was built:** [BUILD_HISTORY.md](BUILD_HISTORY.md) has the dated timeline, from the first idea on 1 October 2026 to today.

| Folder | What it is |
| --- | --- |
| [`backend/`](backend/README.md) | FastAPI + SQLite: matters, documents, chat over SSE, summaries, drafts, exports |
| [`frontend/`](frontend/README.md) | React app: sign-in, chat, document viewer, summaries, drafts |
| [`scripts/`](scripts/) | `dev.sh` starts both for development |
| [`architecture/`](architecture/) | Technical architecture diagrams |

Plans and their status: [`BACKEND_TODO.md`](BACKEND_TODO.md), [`FRONTEND_TODO.md`](FRONTEND_TODO.md), [`INTEGRATION_TODO.md`](INTEGRATION_TODO.md). Decisions: [`IDEAS.md`](IDEAS.md).

## First-time setup

macOS on Apple silicon. Backend setup (Python, ClamAV, the Docling models, a seeded database) is in [`backend/README.md`](backend/README.md#first-time-setup-macos-apple-silicon). Frontend:

```bash
cd frontend && npm install
```

## Run it as one app

```bash
cd frontend && npm run build:app          # builds the app for the real backend into frontend/dist
cd ../backend && uv run legallens serve --worker
```

Open **http://127.0.0.1:8000**. The API serves the built app from the same origin, so there is no proxy and no CORS. `--worker` runs the background worker (ingestion, summaries, drafts, exports) inside the same process.

Sign in with `lawyer@legallens.local`, any password, then any six digits.

## Run it for development

```bash
scripts/dev.sh        # backend on :8000 (auto-reload + worker) and the app on http://localhost:5173
```

Or each side alone:

| Command | Does |
| --- | --- |
| `cd backend && uv run legallens dev` | API with auto-reload and an in-process worker |
| `cd frontend && npm run dev:http` | App against the backend, via Vite's proxy |
| `cd frontend && npm run dev` | App on the in-browser mock, with its dev panel (⌘⇧D). No backend needed |

## Tests

| Command | Runs |
| --- | --- |
| `cd backend && uv run pytest` | Backend unit, API, streaming and security tests |
| `cd frontend && npm test` | Frontend unit tests and the HTTP client's contract tests |
| `cd frontend && npm run test:e2e` | Browser tests on the mock |
| `cd frontend && npm run test:e2e:real` | The main flows against a throw-away real backend and the dev server |
| `cd frontend && npm run test:e2e:single` | The same flows against the single app (builds first) |

The real and single runs start their own backend on port 8100 in a temporary folder, use the machine's ClamAV if it is running, and stop it afterwards.

## After an API change

```bash
cd backend && uv run legallens openapi     # regenerate openapi.json
cd ../frontend && npm run api:types        # regenerate the typed wire schema
npm run api:fixtures                       # re-record contract fixtures (needs a seeded backend with a worker on :8000)
```

## Security and release commands (2026-10-15)

- Real sign-in: `LEGALLENS_AUTH_MODE=real`, then `legallens user create --email you@firm.com`.
- Encrypt the database and files: `legallens db encrypt`; store the key from `legallens key show` apart from backups.
- HTTPS on this computer: `legallens cert trust`, then `legallens serve --worker --https`.
- Backups: `legallens backup create --to <folder>`, `backup verify <file>`, `backup prune --folder <folder>`.
- Feedback to test cases: `legallens feedback export --to cases.jsonl`.
- Release gate: `scripts/release_gate.sh [model]` (suites, golden set, comparison with `golden_baseline.json`).
- What to do when something goes wrong: `INCIDENT_PLAN.md`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: ruff, mypy and pytest for the backend; types,
lint, format, unit tests, build and the mock-data browser tests for the frontend; and a check that `openapi.json`
matches the app. The real-model tests, the real-backend UAT and the golden-set gate need Ollama and run locally
with `scripts/release_gate.sh`.

## Secret scanning

LegalLens uses no API keys today (all models are local), and nothing in the repository is a secret. To keep it
that way if a cloud model is ever added:

- CI job `secrets` scans the full git history with gitleaks (`.gitleaks.toml`) on every push and fails on a finding.
- A local pre-commit hook blocks a commit that adds one: `brew install gitleaks`, then
  `git config core.hooksPath scripts/githooks` (once per clone).
- Real keys belong in environment variables or the OS keychain, never in a file in this folder; `.gitignore`
  already excludes `.env*`, `*.key`, `*.pem` and similar.

## The golden-set gate in CI

`.github/workflows/golden-gate.yml` runs the golden set against the real local models and fails on any drop from
`golden_baseline.json` or on any invented answer. It runs on a **self-hosted runner** (a Mac with Ollama and the
models), nightly, on pushes to `main` that touch the answering code, and on demand (Actions tab → "Golden-set
gate" → Run workflow). GitHub's hosted runners have neither Ollama nor a GPU.

One-time setup on the Mac that has the models:

1. Repository → Settings → Actions → Runners → **New self-hosted runner** → macOS, ARM64. Run the download
   commands it shows, then configure with the extra label `ollama`:
   `./config.sh --url https://github.com/<you>/legallens --token <one-time token from that page> --labels ollama`
   (the token is single-use and expires within the hour; never paste it anywhere else).
2. Keep it running: `./svc.sh install && ./svc.sh start` from the runner folder.
3. Keep Ollama running: `brew services start ollama`, with `qwen2.5:7b-instruct` and `llama3.2:3b` pulled and
   `legallens models download --what embeddings` done.

Safety: a self-hosted runner runs whatever a workflow says, so keep the repository private and do not add
`pull_request` triggers for outside contributors. The job fails early, with the fix, if Ollama or a model is missing.
