# Backend rules

Commands (run, test, lint, CLI) live in the README, so they have one source of truth:

@README.md

## Rules

- Every query on client data carries `matter_id` (DEC-53). Never bypass the scope guard.
- Model calls go through `models/llm.py` only. No client or document text in logs, errors or test output (DEC-68).
- Fast suite first: `uv run pytest -q`, then `uv run ruff check src tests` and `uv run mypy src`. `-m llm` needs Ollama;
  `-m slow` runs Docling, OCR and ClamAV.
- A change to retrieval, citations or summaries is judged against the golden sets in the repo root (`GOLDEN_*.md`),
  and a change that lowers one needs a reason.

## Learned the hard way

- Tests use the **fast** PDF converter; the real app uses **Docling**. They split text differently, so verify
  retrieval and citation changes with Docling before believing a result.
- A passing "structure" check (citation exists, quote is literal) is not a correct answer. Read answers against the
  source document.
- The UI sends a summary template only when the lawyer picked one; otherwise the backend matches it to the document.
- The worker must keep its heartbeat fresh during long jobs, or the app wrongly says background work is paused.
