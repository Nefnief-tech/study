#!/usr/bin/env bash
# Semester — production start via Bun on port 8899
# First run installs production dependencies automatically.
set -euo pipefail
cd "$(dirname "$0")/.."

export NODE_ENV=production
export PORT="${PORT:-8899}"
export HOSTNAME=0.0.0.0

if [ ! -d node_modules ]; then
  echo "Installing dependencies with bun…"
  bun install --production
fi

# the production build ships in .next — no build step needed
exec bun run start:prod
