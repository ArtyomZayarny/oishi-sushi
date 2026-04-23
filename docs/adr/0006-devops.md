# ADR-0006: DevOps — Docker Compose (local) + GitHub Actions (CI), no production deploy

## Status

`Accepted`

## Date

2026-04-23

## Context

The PRD explicitly scopes out production deployment ("demo runs locally via Docker Compose"). What remains is: make `git clone && docker compose up -d && pnpm install && pnpm nx run-many -t serve` work end-to-end on a teammate's laptop, and make CI enforce the same quality gates that pre-commit hooks enforce locally.

Playbook reference: `docs/_playbook/06-devops.md` ("portfolio / demo → compose locally + CI, skip deploy until there's a user").

## Options considered

### Option A — Docker Compose (local Postgres) + GitHub Actions (CI only)

- **Pros:** one `docker-compose.yml`, one service (`postgres:16-alpine`), healthcheck + named volume; CI runs on every push/PR and runs the same `nx affected lint test build` + `nx e2e web-e2e` that a developer runs locally; no deploy pipeline to maintain; no cloud bill.
- **Cons:** "click to try" is not possible — recruiters have to clone and run.
- **Cost / effort:** low — compose + one GHA workflow file.
- **Reversibility:** high — adding a deploy job later is additive.

### Option B — Compose locally + Fly.io (or Railway) deploy

- **Pros:** live URL in the README; one-click demo for recruiters.
- **Cons:** cold-start pain on free tier; seeded data can get mutated by visitors; secrets management adds ceremony; out of scope per PRD §13.
- **Cost / effort:** medium — Dockerfile for api and ssr, `fly.toml`, DB provisioning, rolling out migrations, seeding in-place.
- **Reversibility:** medium — cloud config accumulates.

### Option C — Kubernetes + Helm charts locally via k3d or kind

- **Pros:** shows "I can do k8s" — but only if recruiters look past the overkill.
- **Cons:** extreme over-engineering for one Postgres + two Node processes; slows down local dev loop; adds five more things that could break before the demo runs.
- **Cost / effort:** high.
- **Reversibility:** medium — the manifests and helm charts become dead weight when removed.

## Decision

Docker Compose for local infra (Postgres only; api and web run with `pnpm nx run ... serve` against the composed DB). GitHub Actions for CI, running on every push to `main` and on PRs. No production deploy in this overnight scope.

## Consequences

### Positive

- `docker-compose.yml` has one service (`postgres:16-alpine`) with healthcheck — covered by `scripts/ensure-services.sh` which the overnight loop runs before DB-dependent phases.
- CI runs `pnpm install --frozen-lockfile` → `pnpm nx affected -t lint test build` → `pnpm nx e2e web-e2e` on Ubuntu + Node 20 + Docker service container for Postgres.
- GHA caches `~/.pnpm-store` keyed on `pnpm-lock.yaml` — warm runs finish in ~3 min.
- Local dev and CI use the same Postgres image tag so "works on my machine" discrepancies are minimal.
- Pre-commit hook (`.husky/pre-commit`) runs lint-staged (eslint --fix + prettier) and `pnpm typecheck` — catches what CI will catch, before push.

### Negative / trade-offs we accept

- No live demo URL; recruiters who don't want to clone see only screenshots + the README.
- CI covers functional tests but no performance regression gate (Lighthouse check is manual, run on the phase 13 polish commit).
- Secrets management is trivial because there are no prod secrets — the demo `.env.example` is committed with placeholder values.

### What this decision forces us to do

- [x] `docker-compose.yml` defines `postgres` service with healthcheck + named volume `oishi_pgdata`.
- [x] `scripts/ensure-services.sh` is idempotent: skips `docker compose up -d postgres` if already healthy; polls `pg_isready` up to 30s.
- [x] `.github/workflows/ci.yml` pins Node 20.20.2, Postgres 16-alpine service, Nx affected flags, Playwright install (chromium only).
- [x] `.husky/pre-commit` runs `pnpm lint-staged && pnpm typecheck` — no skipping (`--no-verify` forbidden per global CLAUDE.md).
- [x] `README.md` documents the exact sequence `docker compose up -d && pnpm install && pnpm prisma migrate deploy && pnpm prisma db seed && pnpm nx run api:serve & pnpm nx run web:serve-ssr`.

## Revisit trigger

- Revisit if a live demo URL becomes a hiring requirement (recruiters explicitly ask for one); if the CI exceeds 10 minutes per run; if a third contributor joins and needs a staging environment.

## Links

- Related ADRs: 0001 (architecture), 0003 (database — compose Postgres)
- PRD section: "Out of scope (explicitly)" (production deploy)
- Playbook ref: `docs/_playbook/06-devops.md`
