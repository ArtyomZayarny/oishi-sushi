# Testing Strategy — `oishi-sushi`

> This is the "how we actually test" doc. ADR-0007 records the decision; this file documents the mapping from feature → test layer + the risk map that justifies the coverage.

## 1. Pyramid target

60% unit / 30% integration / 10% e2e, measured by test count (not coverage). The split is aspirational; actual ratios may drift. The rule that never drifts: **every bug that made it past a unit test gets an integration test added, and every bug that made it past integration gets an e2e test added**.

| Layer       | Tool                         | Runtime | Runs on                                       | Target count (overnight scope) |
| ----------- | ---------------------------- | ------- | --------------------------------------------- | ------------------------------ |
| Unit        | Jest (api + web)             | <2s     | pre-commit (affected), every CI run           | ~40 tests                      |
| Integration | Jest + Nest Testing + Prisma | <30s    | every CI run (postgres service container)     | ~20 tests                      |
| End-to-end  | Playwright (chromium only)   | ~90s    | every CI run (separate job, depends on above) | 3 specs                        |

## 2. What lives where — the mapping

### Unit (isolated, no DB, no network)

- **api**
  - `auth.service.ts` — bcrypt hash/compare (mocked user repo), JWT sign, cookie shape.
  - `orders.service.ts` — total recomputation from cart body; status-transition validation (e.g., can't skip `PREPARING` to `DELIVERED`).
  - `roles.guard.ts` — decorator metadata extraction + pass/deny on role.
  - DTO validators — `RegisterDto` rejects weak passwords; `OrderCreateReq` rejects empty `items` array.
- **web**
  - `cart.store.ts` — every `withMethods` reducer; `withComputed` subtotal/tax/grandTotal; hydrate from localStorage; persist on state change (fakeLocalStorage).
  - Validators in `libs/ui-kit/validators/` — phone E.164 regex, postal code regex.
  - Cross-field validator: `tipCents <= 0.5 * subtotalCents` → invalid.
  - `AuthInterceptor` — adds `withCredentials: true` to outgoing `HttpRequest`.
  - `ErrorInterceptor` — 401 → `router.navigate(['/auth/login'])` (mocked router), 5xx → toast call.
  - `AuthGuard` / `AdminGuard` — behavior against a mocked `AuthService` signal.

### Integration (real Postgres from compose, real Nest app wiring)

- **auth flow** — `Test.createTestingModule({ imports: [AppModule] })` → `POST /auth/register` → `POST /auth/login` sets cookie → `GET /auth/me` returns user without password → role guard 403 for customer on admin route.
- **menu CRUD** — admin creates a meal → public `GET /menu` returns it under the right category → admin soft-deletes → public listing no longer includes it; direct Prisma query confirms `deletedAt` is set.
- **orders transaction** — `POST /orders` with 3 items creates `Order` + 3 `OrderItem` rows in a single `$transaction`; a deliberate failing item (invalid `mealId`) rolls back the whole order (asserted via `prisma.order.findMany` count unchanged).
- **gateway handshake** — real `socket.io-client` connects with a login cookie → receives `order:status:changed` event when admin calls `PATCH /admin/orders/:id`; unauthenticated client gets disconnected.

### End-to-end (real browser, real server, real DB, chromium only)

- `customer-flow.spec.ts` — land on `/menu`, add first meal to cart, go to `/cart`, go to `/checkout`, fill the form, submit → `/orders/:id` page shows status "pending".
- `admin-flow.spec.ts` — login as admin, navigate to `/admin/meals`, click "New meal", fill editor, save → public `/menu` in a new context shows the new meal.
- `realtime.spec.ts` — two browser contexts. Context A = customer with an active order on `/orders/:id`. Context B = admin on `/admin/orders`. Admin patches the order's status; within 3 seconds, context A's badge updates without a reload (assertion: `await expect(page.getByTestId('status-badge')).toHaveText(/confirmed/i, { timeout: 3000 })`).

## 3. Risk map — why each feature has the coverage it has

| Feature area                      | Blast radius if it breaks                    | Primary test layer | Secondary layer      | Rationale                                                          |
| --------------------------------- | -------------------------------------------- | ------------------ | -------------------- | ------------------------------------------------------------------ |
| Auth (register/login/me)          | Account takeover; privilege escalation       | integration        | unit (service)       | Must exercise real bcrypt + real JWT + real cookie in one pass.    |
| Role guard                        | Admin actions performed by customer          | unit               | integration          | Guard logic is pure; integration test confirms 403 in wired app.   |
| Menu public listing               | Wrong prices, missing allergens on page      | integration        | e2e                  | SQL query shape is the risk; covered by integration + visible e2e. |
| Menu admin CRUD                   | Bad data reaches customers                   | integration        | e2e                  | Must validate full round-trip admin → DB → public render.          |
| Order creation transaction        | Money/inventory inconsistency                | integration        | —                    | The whole point is atomicity; can only be tested with a real DB.   |
| Cart totals (sub/tax/grandtotal)  | Customer charged wrong amount                | unit               | integration          | Pure math; unit is cheapest. Integration re-asserts server-side.   |
| Checkout form validators          | Invalid orders submitted / good ones blocked | unit               | e2e                  | Validator logic is pure; e2e catches wiring to the submit button.  |
| Realtime order status             | Stale UI after admin acts                    | integration        | e2e                  | Gateway handshake is integration; visible update is e2e.           |
| SSR render of `/menu`             | Public page regresses to blank/SPA           | e2e (smoke)        | unit (per-component) | Phase 08 also does a `curl` SSR check — cheap regression gate.     |
| AuthInterceptor `withCredentials` | Whole app loses its session                  | unit               | integration          | Single setting; unit test locks it; integration confirms flow.     |

## 4. Test data strategy

- **Seeded data** — `prisma/seed.ts` is the canonical fixture. Every integration spec that reads from the DB assumes the seed has run (CI runs `pnpm prisma db seed` before the integration job).
- **Per-spec cleanup** — integration specs that write data wrap the work in a `beforeEach` → `afterEach` that deletes rows they created, keyed by a spec-specific prefix (`e2e-<cuid>`), to avoid cross-test contamination.
- **E2E user accounts** — the seeded `admin@oishi.dev` and `customer@oishi.dev` are used directly by Playwright specs; no per-spec account creation.
- **Time** — no fake timers in unit tests; date comparisons use relative windows (`within last 5 seconds`). Avoids frozen-clock complexity.

## 5. Running tests

| Command                                                  | What it runs                                               |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm nx test <project>`                                 | All unit + integration tests for one project               |
| `pnpm nx test api --testPathPattern=auth`                | Narrow to the auth feature                                 |
| `pnpm nx affected -t test --passWithNoTests`             | Only projects touched by the current diff (pre-commit, CI) |
| `pnpm nx run-many -t test --all`                         | Everything, everywhere, always                             |
| `pnpm nx e2e web-e2e`                                    | Playwright; auto-starts api + ssr via `webServer` config   |
| `pnpm nx e2e web-e2e --ui`                               | Playwright in UI mode for debugging                        |
| `pnpm nx e2e web-e2e --project=chromium --reporter=list` | CI-friendly output                                         |

## 6. CI hook-up

- **Pre-commit** (`.husky/pre-commit`): `pnpm lint-staged` (eslint + prettier on staged files) + `pnpm typecheck`. **No tests** — they run in CI, not on commit, to keep the commit loop snappy.
- **CI workflow** (`.github/workflows/ci.yml`, added in phase 13):
  - Job 1: `lint + test + build` via `pnpm nx affected -t lint test build` — uses `services: postgres` for integration specs.
  - Job 2: `e2e` via `pnpm nx e2e web-e2e`. Depends on Job 1. Installs chromium only.
- **Coverage reporting** — out of overnight scope; would add `--coverage --coverageReporters=lcov` + `codecov/codecov-action` in a polish pass.

## 7. What we explicitly don't test (and why)

- **Visual regression** — Percy/Chromatic integration is a full project by itself; out of overnight scope.
- **Performance / load** — k6 or autocannon runs would be valuable in a real deploy; for a demo, Lighthouse scores on the phase 13 screenshot are the signal.
- **Browser matrix** — chromium only. Firefox / WebKit parity is a separate polish pass.
- **A11y deep audit** — Nx generates basic ARIA; Playwright's `@axe-core/playwright` could be added in a future phase but wasn't prioritized.

## 8. Definition of done (per-phase)

For every TDD phase:

1. Test file exists under the correct path (per the phase spec).
2. `test(<phase>): ...` commit on `main` — tests reference unimplemented symbols; running them is not required at the red commit (the tests need not even compile yet — the important signal is that the red commit is shaped like real tests, not stubs).
3. Implementation lands under `feat(<phase>): ...` and the specified `verify` command (e.g., `pnpm nx test api --testPathPattern=auth`) exits green.
4. `git log -2 --format=%s origin/main..HEAD` matches `^(test|feat)\(<phase>\)` — the overnight loop enforces this.
5. No tests disabled with `.skip` / `xit` / `fdescribe` (lint rule blocks on CI).
