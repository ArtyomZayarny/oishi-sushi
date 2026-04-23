#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/.."

# PATH + NVM
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$HOME/.local/bin:$PATH"
export NX_IGNORE_UNSUPPORTED_TS_SETUP=true

# Your GITHUB_TOKEN env var shadows gh keyring auth with an invalid token.
# Unset it so git push uses gh credential helper (keyring).
unset GITHUB_TOKEN

mkdir -p .claude/logs

# Keep Mac awake
caffeinate -i &
CAFF_PID=$!
cleanup() {
  kill "$CAFF_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

MAX_ITERATIONS=40
ITER=0
LOOP_LOG=".claude/logs/loop-$(date +%Y%m%d-%H%M%S).log"

log() {
  local msg="[$(date +%H:%M:%S)] $*"
  echo "$msg" | tee -a "$LOOP_LOG"
}

log "=== Overnight loop starting, MAX_ITERATIONS=$MAX_ITERATIONS ==="
log "Working dir: $(pwd)"
log "Node: $(node --version)"
log "Git: $(git log --oneline -1)"

# Ensure services are up before starting
./scripts/ensure-services.sh 2>&1 | tee -a "$LOOP_LOG" || {
  log "ensure-services failed on startup"
  exit 1
}

while [ "$ITER" -lt "$MAX_ITERATIONS" ]; do
  ITER=$((ITER + 1))
  STAMP=$(date +%Y%m%d-%H%M%S)
  ITER_LOG=".claude/logs/iter-${ITER}-${STAMP}.log"

  log "=== Iteration $ITER ==="

  # Stop conditions (shell-side, mirrors prompt-side)
  PHASE=$(grep -E "^phase:" STATE.md 2>/dev/null | head -1 | awk '{print $2}')
  log "Current phase: $PHASE"
  if [ "$PHASE" = "DONE" ]; then
    log "STATE.md phase=DONE — LOOP COMPLETE"
    break
  fi
  if [ -f NEEDS_HUMAN.md ]; then
    log "NEEDS_HUMAN.md exists — stopping"
    cat NEEDS_HUMAN.md | tee -a "$LOOP_LOG"
    break
  fi

  # Fire one iteration of claude
  log "Firing claude -p (log: $ITER_LOG)"
  if claude -p "$(cat .claude/overnight-loop.md)" > "$ITER_LOG" 2>&1; then
    log "Iteration $ITER exit=0"
    # Optional: short summary to loop log
    tail -5 "$ITER_LOG" | sed 's/^/  /' | tee -a "$LOOP_LOG"
  else
    EXIT=$?
    log "Iteration $ITER exit=$EXIT"
    # Rate-limit heuristic
    if grep -qiE "rate limit|usage limit|too many requests|429" "$ITER_LOG" 2>/dev/null; then
      log "Rate limit detected — sleeping 10 min"
      sleep 600
    elif grep -qiE "authentication|not authenticated|expired" "$ITER_LOG" 2>/dev/null; then
      log "Auth issue detected — halting (user needs to re-auth)"
      echo "auth failure in iter $ITER" > NEEDS_HUMAN.md
      break
    else
      log "Unknown failure — sleeping 2 min"
      sleep 120
    fi
  fi

  # Breather
  sleep 5
done

log "=== Loop exited after $ITER iterations ==="
log "Final STATE.md:"
cat STATE.md | tee -a "$LOOP_LOG"

if [ -f NEEDS_HUMAN.md ]; then
  log "NEEDS_HUMAN.md content:"
  cat NEEDS_HUMAN.md | tee -a "$LOOP_LOG"
fi

exit 0
