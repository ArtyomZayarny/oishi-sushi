# ADR-0007: Testing strategy — pyramid 60/30/10 with Jest + Playwright (chromium) + real Postgres for integration

## Status

`Accepted`

## Date

2026-04-23

## Context

The overnight loop is TDD-driven for every feature phase (phases 02–05, 07–12), which means the tests are the contract the implementation must satisfy before a commit is made. For TDD to produce real signal, the tests must fail first (phase's `test` commit) and pass after implementation (phase's `feat` commit). They also must be fast enough that the loop's `verify` gate completes in seconds, not minutes.

Playbook reference: `docs/_playbook/07-testing-quality.md` (decision tree: "single-team Nx monorepo with realtime → 60% unit, 30% integration with compose DB, 10% e2e with chromium").

## Options considered

### Option A — Pyramid 60/30/10 with Jest (unit) + Jest + real Postgres (integration) + Playwright chromium (e2e)

- **Pros:** Jest ships with every Nx preset; real Postgres via the same `docker-compose.yml` the dev uses locally means integration tests hit the same SQL behavior as production — no "it passed under SQLite" surprises; Playwright chromium-only keeps the browser-install payload small (per §9.0 preflight: `pnpm exec playwright install chromium`) and matches the likely reviewer's environment; SignalStore, SSR, and realtime all have clean test shapes in this split.
- **Cons:** requires the compose Postgres to be up for integration tests — covered by `scripts/ensure-services.sh`; Playwright has a slower startup than Jest (~3s vs ~0.5s).
- **Cost / effort:** moderate — Nx generators give Jest + Playwright configs out of the box.
- **Reversibility:** high.

### Option B — Unit + e2e only (no integration layer)

- **Pros:** simpler — unit tests are fast, e2e tests cover everything else end-to-end; no compose dependency for mid-level tests.
- **Cons:** controllers + Prisma get either "mocked Prisma" (false confidence) or "only tested via Playwright" (slow, flaky); order-creation transactions need integration coverage.
- **Cost / effort:** lower.
- **Reversibility:** medium.

### Option C — Testcontainers-based integration (spin up ephemeral Postgres per test run)

- **Pros:** hermetic — no state bleed between test runs; no compose dependency.
- **Cons:** 5–15s startup cost per run kills the TDD loop; CI disk pressure (multiple postgres images pulled); overkill for a single schema with known seed data.
- **Cost / effort:** medium — testcontainers library + lifecycle plumbing.
- **Reversibility:** medium — swapping back to a shared compose DB is trivial but the test code gets rewritten.

## Decision

Pyramid 60/30/10. Unit tests (Jest) for pure logic — services, pipes, validators, signal-store reducers, route guards, interceptors. Integration tests (Jest + Nest Testing module + real Prisma against compose Postgres) for controller ↔ service ↔ DB wiring — auth flow, menu CRUD, orders transaction, gateway handshake. End-to-end tests (Playwright chromium-only, 3 specs) for user-facing flows — customer menu→cart→checkout, admin meal CRUD, realtime status push across two browser contexts.

## Consequences

### Positive

- Fast feedback: unit tests for every feature run in <2s; integration suite in <30s (one postgres connection pool held open across specs); e2e suite in ~90s for 3 specs.
- TDD is cheap: write failing spec → `test(phase): ...` commit, implement → `feat(phase): ...` commit, per the overnight loop's HARD RULES.
- Integration tests catch the exact class of bug that mocked unit tests miss (missing migrations, broken constraints, enum serialization, transactional ordering).
- Playwright `webServer` config auto-spawns the ssr + api + ensures postgres before the specs run — CI and local run identically.

### Negative / trade-offs we accept

- Integration tests share state with the dev DB unless each spec cleans up after itself — mitigated by running each describe block inside a transaction that rolls back, or by truncating before each suite (`BEGIN ... ROLLBACK` in `afterEach`).
- Playwright chromium-only means we don't catch Safari/Firefox-specific rendering bugs; acceptable since the portfolio target is "works in Chrome, looks polished on recruiter's laptop".
- The 60/30/10 split is aspirational — actual ratios will drift (complex forms attract unit tests, auth attracts integration tests). Monitored but not enforced.

### What this decision forces us to do

- [x] `apps/api/jest.config.ts` with one `testEnvironment: 'node'` config; integration specs use `Test.createTestingModule({ imports: [AppModule] }).compile()` then `app.init()`.
- [x] `apps/web/jest.config.ts` with `jest-preset-angular` (Nx default) + `testEnvironment: 'jsdom'`.
- [x] `apps/web-e2e/playwright.config.ts` with `projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]` only, `webServer` entries for api + ssr, `reuseExistingServer: !process.env.CI`.
- [x] CI workflow runs `pnpm nx affected -t lint test build` first, then `pnpm nx e2e web-e2e` as a separate job that depends on the first.
- [x] Pre-commit: `pnpm typecheck` + `pnpm lint-staged` — tests run in CI, not pre-commit, to keep the commit loop fast.

## Revisit trigger

- Revisit if integration tests exceed 60s wall clock (move to testcontainers or split into parallel jobs); if Playwright flake rate exceeds 5% per run; if a second browser target becomes a requirement.

## Links

- Related ADRs: 0001 (architecture), 0006 (devops), 0004 (frontend)
- PRD section: "In scope (MVP)" (implicit — every feature ships with tests)
- Playbook ref: `docs/_playbook/07-testing-quality.md`
- Full strategy: `docs/testing.md`
