#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Ensure Docker Desktop is running (macOS)
if ! docker info >/dev/null 2>&1; then
  if [ -d /Applications/Docker.app ]; then
    open -a Docker
    for i in {1..30}; do
      if docker info >/dev/null 2>&1; then break; fi
      sleep 2
    done
  else
    echo "docker not running and Docker Desktop not found" >&2
    exit 1
  fi
fi

# Postgres up?
if ! docker compose ps postgres 2>/dev/null | grep -qE "healthy|Up"; then
  docker compose up -d postgres
fi

# Wait until ready
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U oishi -d oishi >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "postgres not healthy after 30s" >&2
exit 1
