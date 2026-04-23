#!/usr/bin/env bash
echo "Stopping overnight loop..."
pkill -f "run-overnight.sh" 2>/dev/null && echo "  killed run-overnight.sh"
pkill -f "caffeinate -i" 2>/dev/null && echo "  killed caffeinate"
echo "Done. Resume with: bash scripts/run-overnight.sh"
