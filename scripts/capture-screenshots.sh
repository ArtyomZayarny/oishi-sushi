#!/usr/bin/env bash
# Captures fresh PNGs of the main pages into docs/screenshots/.
# Boots postgres + the web dev server (api comes via dependsOn), runs the
# opt-in @screenshots Playwright suite (gated by SCREENSHOT_OUT).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR="docs/screenshots"
mkdir -p "$OUT_DIR"

bash ./scripts/ensure-services.sh

# Make sure the schema is migrated and seeded so screenshots show real data.
pnpm prisma migrate deploy >/dev/null
pnpm db:seed >/dev/null

cd apps/web-e2e
SCREENSHOT_OUT="../../$OUT_DIR" pnpm exec playwright test \
  --config=playwright.config.ts \
  --reporter=list \
  --project=chromium \
  src/screenshots.spec.ts
