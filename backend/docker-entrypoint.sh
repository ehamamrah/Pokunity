#!/bin/sh
# Applies pending migrations and the idempotent seed, then hands PID 1 (via tini) to the app.
set -eu

node dist/cli/migrate.js

if [ "${SKIP_SEED:-false}" != "true" ]; then
  node dist/cli/seed.js
fi

exec "$@"
