# LegalLens backend

The local FastAPI backend for LegalLens. It covers matters, documents, chat over Server-Sent Events, summaries, drafts and exports, all in one SQLite file with hybrid search (FTS5 + sqlite-vec).

The plan and its status are in [`../BACKEND_TODO.md`](../BACKEND_TODO.md). The API contract is [`openapi.json`](openapi.json). Browse it at http://127.0.0.1:8000/docs while the server runs.

> **Synthetic documents only (DEC-73).** Data at rest is not encrypted yet, and sign-in runs in dev mode. Don't put real client documents in until the security slice is done.

## What's real and what's a stand-in

| Part | Status |
| --- | --- |
| API (43 endpoints), SSE streams, matter scoping, audit log, deletion, exports | Real |
| Ingestion: byte sniffing, ClamAV, hidden content, Docling + Tesseract OCR, legal structure, chunking, FTS5 + sqlite-vec | Real |
| Sign-in | Dev mode: any password, any 6-digit code. Sessions and cookies are real |
| Embeddings | Deterministic hashing embedder until the model is chosen (DEF-01). Ollama is optional |
| Chat answers, summary text, draft text | **Stub orchestrator.** It runs the real search, quotes passages with real citations and leaves `[PLACEHOLDER]`s. LangChain replaces it behind the same interface |

## First-time setup (macOS, Apple silicon)

```bash
cd LegalLens/backend
uv sync                                   # Python 3.13 + dependencies (about 1.2 GB with PyTorch)
brew install clamav                       # once; then configure it as below
brew services start clamav                # local malware scanner, Unix socket only
uv run legallens models download          # Docling layout + table models, once (the only download)
uv run legallens db upgrade               # create the database
uv run legallens seed --with-documents    # dev user + 3 demo matters + synthetic documents
```

ClamAV config: `/opt/homebrew/etc/clamav/clamd.conf` needs `LocalSocket /opt/homebrew/var/run/clamav/clamd.sock` and no TCP socket. `freshclam.conf` needs a `DatabaseDirectory`. Then run `freshclam` once to download the virus definitions.

## Run

```bash
uv run legallens dev          # API on http://127.0.0.1:8000 with auto-reload + an in-process worker
# or, as two processes:
uv run legallens serve
uv run legallens worker
```

Sign in from Swagger UI (`/docs`) with `POST /api/v1/auth/dev-session` (body `{}`). This dev-only shortcut does both sign-in steps at once. Or use the real two steps: `POST /auth/login`, then `POST /auth/mfa/verify` with any 6 digits.

A chat turn over curl:

```bash
B=http://127.0.0.1:8000/api/v1
curl -c jar -X POST $B/auth/dev-session -H 'content-type: application/json' -d '{}'
curl -b jar $B/matters                                                   # pick a matter id
curl -b jar -X POST $B/matters/<matter_id>/conversations -H 'content-type: application/json' -d '{}'
curl -b jar -X POST $B/conversations/<conversation_id>/messages \
     -H 'content-type: application/json' -H 'Idempotency-Key: 1' \
     -d '{"content": "How must a termination notice be delivered?"}'
curl -N -b jar http://127.0.0.1:8000/api/v1/runs/<run_id>/stream     # SSE: tokens, citations, done
```

## Other commands

| Command | Does |
| --- | --- |
| `uv run legallens search "notice to terminate" --matter <id>` | Print both search legs and the fused ranking |
| `uv run legallens jobs run` | Run every queued job now, then exit |
| `uv run legallens audit verify` | Check the audit log's hash chain |
| `uv run legallens db reset --yes` | Dev only: delete the database and stored files, then recreate |
| `uv run legallens openapi` | Regenerate `openapi.json` after an API change |

## Tests

```bash
uv run pytest                 # 109 tests, about 45 s: unit, API, streaming, security
uv run pytest -m slow         # real Docling and ClamAV (needs the models and clamd)
uv run pytest --cov=legallens # coverage (90%)
uv run ruff check src tests && uv run mypy src
```

The security suite checks:
- cross-matter leaks
- a second lawyer getting 403 on every endpoint
- the scope guard and its statement cache
- the audit chain and audit coverage of every write
- client text never reaching the logs
- no outbound connections
- clean `.docx` exports
- real deletion

## Where data lives

Data goes in the OS app-data folder, never the project folder:

- **macOS:** `~/Library/Application Support/LegalLens`
- **Windows:** `%LOCALAPPDATA%\LegalLens`
- **Linux:** `~/.local/share/legallens`

That folder holds:
- `legallens.db` (SQLite, WAL)
- `files/<matter_id>/`, the original uploads
- `quarantine/`
- `exports/`
- `models/docling/`

Override it with `LEGALLENS_DATA_DIR`. **Don't point it at a cloud-synced folder.** On this Mac, the Desktop syncs to iCloud.

Settings are `LEGALLENS_*` environment variables, or a `.env` file; see [`.env.example`](.env.example).

## macOS notes

- **iCloud and the virtual environment.** The project sits under an iCloud-synced Desktop, so the virtual environment lives in `.venv.nosync`, which iCloud skips, with `.venv` as a link to it. If `import legallens` ever fails after `uv sync`, iCloud has re-marked the `.pth` files as hidden. Python 3.13 skips hidden `.pth` files. Fix it with `chflags nohidden .venv/lib/python3.13/site-packages/*.pth`. The tests don't depend on this (`pythonpath = ["src"]`).
- **SQLite extensions.** The python.org Python 3.14 build can't load SQLite extensions. uv's managed Python 3.13 can, and it's pinned in `.python-version`.
- **ClamAV after a reboot.** `brew services start clamav` registers a login agent. If uploads return `503 scanner_unavailable`, run `brew services restart clamav`. Uploads fail closed, so nothing is accepted unscanned. For development without ClamAV, set `LEGALLENS_SCANNER=none`.

## Layout

```
src/legallens/
  api/v1/          routes, grouped A–H as in the API reference, plus Ops
  services/        business logic: matters, chat turns, documents, deletion, drafts, summaries, audit, events
  db/              models, engine (WAL, sqlite-vec), matter-scope guard, migrations helper
  migrations/      Alembic (FTS5, vec0 and the audit triggers are raw SQL)
  ingestion/       sniff, scanner, hidden content, email, triage, OCR, converters, legal structure, chunker
  search/          FTS query builder, hybrid search with RRF, scope labels, pinpoints, sentence choice
  orchestrator/    the Orchestrator interface and the stub
  drafting/        placeholders, authority detection, checks, templates, .docx export
  jobs/            queue, worker, handlers (ingest, summarize, draft, regenerate, export)
  streaming/       chat runs: buffered, replayable, cancellable
  samples/         synthetic documents and the dev seed
```
