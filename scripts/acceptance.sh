#!/usr/bin/env bash
# Acceptance runner stub — invoked by the overnight loop between unit verify
# and `git push`. See ~/.claude/templates/acceptance/acceptance-runner.md
# for the canonical flow.
#
# For oishi-sushi the CUJs are driven via Playwright MCP from inside the
# autonomous iteration — not a shell harness. This script's job is:
#   1. Preflight: ensure services up + DB seeded.
#   2. Phase assertions from `plans/<slug>.md` §Acceptance (HTTP/DB/SHELL).
#   3. Return 0 (all green) or non-zero (failed — see $ARTIFACT_DIR/report.md).
#
# Usage: scripts/acceptance.sh <phase-id>
# Example: scripts/acceptance.sh 02-api-auth

set -uo pipefail

cd "$(dirname "$0")/.."

PHASE="${1:-unknown}"
ITER="${ITER:-$(date +%s)}"
ARTIFACT_DIR="iter-${ITER}/acceptance/phase-${PHASE}"
mkdir -p "$ARTIFACT_DIR/screenshots"
LOG="$ARTIFACT_DIR/run.log"
REPORT="$ARTIFACT_DIR/report.md"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
fail() { echo "FAIL: $*" | tee -a "$REPORT"; exit 1; }

log "=== Acceptance for phase $PHASE, iter $ITER ==="

# ---- 1. Preflight -------------------------------------------------------
log "Preflight: ensuring services"
./scripts/ensure-services.sh 2>&1 | tee -a "$LOG" || fail "services didn't come up"

# API health
for i in {1..15}; do
  if curl -fsS http://localhost:3000/api >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://localhost:3000/api >/dev/null 2>&1 || fail "API /api not healthy on :3000"
log "  API healthy"

# Web SSR health (optional — some phases don't need it)
if curl -fsS http://localhost:4000/ >/dev/null 2>&1; then
  log "  Web SSR healthy"
else
  log "  Web SSR not running (phase may not require it)"
fi

# DB seed sanity
MEAL_COUNT=$(docker compose exec -T postgres psql -U oishi -d oishi -tAc 'SELECT COUNT(*) FROM "Meal" WHERE "deletedAt" IS NULL;' 2>/dev/null | tr -d ' ')
if [ "${MEAL_COUNT:-0}" -lt 6 ]; then
  log "  Seed low ($MEAL_COUNT meals) — re-seeding"
  pnpm db:seed 2>&1 | tee -a "$LOG" || fail "re-seed failed"
fi

# ---- 2. Phase assertions ------------------------------------------------
# Parse the `## Acceptance` block from plans/<slug>.md for this phase.
# For now, this is a stub — inside the autonomous loop, the iteration reads
# the block via claude's file tooling and executes each assertion inline.
# This shell path is exercised only when called outside the loop.

PLAN_FILE=$(ls plans/*.md 2>/dev/null | head -1)
if [ -z "$PLAN_FILE" ]; then
  log "  No plan file under plans/ — skipping phase assertions (CUJs still run via claude)"
else
  log "  Plan file: $PLAN_FILE (assertions parsed by claude, not this script)"
fi

# ---- 3. CUJ regression --------------------------------------------------
# CUJs are in acceptance/cujs.md. They are driven by claude via Playwright MCP,
# not by this script. This block is a sanity nudge only.
if [ ! -f acceptance/cujs.md ]; then
  fail "acceptance/cujs.md missing — draft one from templates/acceptance/cujs.template.md"
fi

log "PASS (shell preflight); CUJs executed separately by claude"
echo "PASS" > "$REPORT"
exit 0
