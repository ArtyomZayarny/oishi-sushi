#!/usr/bin/env bash
# T13 — run the route-intercepted sommelier e2e WITHOUT a real backend.
#
# The sommelier specs mock /api/menu and /api/sommelier, so they only need the
# built SPA served statically — no api, no Postgres, no LLM. This script serves
# `web:serve-static` (dependency-free; the default `web:serve` pulls in
# @org/api:serve, which needs Docker/Postgres) and runs only sommelier.spec.ts.
# Playwright reuses the running :4200 server (reuseExistingServer: true).
#
# Usage:  bash scripts/e2e-sommelier.sh
# Exit code is Playwright's (0 = all green).
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT=4200
LOG="$(mktemp -t somm-static.XXXX.log)"

echo "→ Building web (SPA bundle)…"
pnpm exec nx build web >/dev/null

echo "→ Starting web:serve-static on :$PORT …"
pnpm exec nx run web:serve-static >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  # Kill the serve-static process group + anything still bound to the port,
  # so a clean run never leaks a server onto :$PORT.
  kill "$SERVER_PID" 2>/dev/null || true
  for pid in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# Wait for the static server.
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/" >/dev/null 2>&1; then
    echo "→ Static server up."
    break
  fi
  sleep 1
done

echo "→ Running sommelier.spec.ts …"
BASE_URL="http://localhost:$PORT" \
  pnpm exec playwright test \
  --config apps/web-e2e/playwright.config.ts \
  sommelier.spec.ts
