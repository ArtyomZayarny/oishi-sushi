#!/usr/bin/env bash
cd "$(dirname "$0")/.."
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"

echo "=== STATE.md ==="
cat STATE.md

echo ""
echo "=== NEEDS_HUMAN.md ==="
if [ -f NEEDS_HUMAN.md ]; then
  cat NEEDS_HUMAN.md
else
  echo "(none — no halt condition triggered)"
fi

echo ""
echo "=== LAST 30 COMMITS ==="
git log --oneline -30

echo ""
echo "=== BRANCH LIST (incl recovery/wip) ==="
git branch -a

echo ""
echo "=== DISK ==="
df -h ~ | tail -1

echo ""
echo "=== LOOP LOG (tail 40 lines) ==="
tail -40 .claude/logs/loop-*.log 2>/dev/null | tail -40 || echo "no loop log yet"

echo ""
echo "=== RUN LOCALLY ==="
echo "docker compose up -d"
echo "pnpm install"
echo "pnpm nx run @org/api:serve &"
echo "pnpm nx run web:serve-ssr"
echo ""
echo "Open: http://localhost:4200"
echo "Admin:    admin@oishi.dev    / demo-admin-pass"
echo "Customer: customer@oishi.dev / demo-customer-pass"
