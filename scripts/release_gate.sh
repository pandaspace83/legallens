#!/usr/bin/env bash
# The pre-release check (NFR-06): static checks, the test suites, the golden set on the answer model, the gate.
# Needs Ollama running with the models pulled. Usage: scripts/release_gate.sh [model]
set -euo pipefail
cd "$(dirname "$0")/.."
MODEL="${1:-qwen2.5:7b-instruct}"

(cd backend && uv run ruff check . && uv run mypy src && uv run pytest -q)
(cd frontend && npx tsc --noEmit -p . && npm test --silent)
(cd backend && LEGALLENS_COMPARE_MODELS="$MODEL" uv run pytest -m llm tests/slow/test_golden_set.py -q)
python3 scripts/release_gate.py --model "$MODEL"
