#!/bin/sh
# With a command (`docker run ... legallens models download`), run that instead of the server.
# Otherwise migrate first, because the app refuses to start on an out-of-date schema. `exec` makes the server
# PID 1, so Docker's SIGTERM reaches uvicorn and the app shuts down cleanly.
set -e
if [ "$#" -gt 0 ]; then
    exec "$@"
fi
legallens db upgrade
exec legallens serve
