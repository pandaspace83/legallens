#!/usr/bin/env bash
# Starts LegalLens for development against the real backend (INT-0.3):
#   - the FastAPI backend with its worker on http://127.0.0.1:8000
#   - the frontend on http://localhost:5173, in http mode, proxying /api to the backend
# Ctrl+C (or stopping this script) stops both. For the frontend on mock data only, run `npm run dev` in frontend/.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
pids=()

# Stop a process and everything it started (uv → python, npm → sh → vite), deepest first.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill -TERM "$1" 2>/dev/null || true
}

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do kill_tree "$pid"; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(cd "$root/backend" && exec uv run legallens dev) &
pids+=($!)
(cd "$root/frontend" && exec npm run dev:http) &
pids+=($!)

echo "LegalLens: backend on http://127.0.0.1:8000, app on http://localhost:5173 (Ctrl+C stops both)"
wait
