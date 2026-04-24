# Critical User Journeys — oishi-sushi

3 flows that define "shippable" for this portfolio app. Regression = halt loop.

## Environment

- **Web (SSR):** `http://localhost:4000`
- **API:** `http://localhost:3000/api`
- **Seeded users:**
  - Admin: `admin@oishi.dev` / `demo-admin-pass`
  - Customer: `customer@oishi.dev` / `demo-customer-pass`
- **Seeded meals:** 6 across 6 categories (Otoro Selection $48, Chef's Omakase $95, Toro Truffle Roll $38, Sashimi Moriawase $72, Ikura Don $32, Couple's Set $128). Seed is idempotent via `pnpm db:seed`; stale meals from prior seeds are soft-deleted automatically.
- **Viewport:** `1440×900` desktop only (portfolio demo; mobile is nice-to-have).

## Readiness (run before any CUJ)

1. `docker compose up -d postgres` → healthy within 10s.
2. `pnpm exec nx run @org/api:serve &` → `curl -fsS http://localhost:3000/api` returns `{"message":"Hello API"}` within 15s.
3. `pnpm exec nx run web:serve-ssr &` → `curl -fsS http://localhost:4000/` returns 200 within 25s (SSR boot is slow).
4. `pnpm db:seed` (re-run to ensure admin + customer + 6 meals exist).

---

## CUJ-1: Customer browses the SSR menu and adds a meal to cart

**Persona:** first-time visitor, not logged in
**Goal:** browse sushi menu, add one meal to cart, see cart count increase
**Preconditions:** seeded DB, services up, no auth cookie

**Steps + assertions:**

1. Navigate to `http://localhost:4000/menu`
   - ASSERT: HTTP 200
   - ASSERT: page source (SSR, before JS boots) contains `data-meal` attributes (≥6)
   - ASSERT: visible text "Otoro Selection" (seeded meal name)
2. Click the "Add to cart" button on `Otoro Selection`
   - ASSERT: cart badge in header updates to `1`
3. Navigate to `/cart`
   - ASSERT: page lists `Otoro Selection` with quantity `1`
   - ASSERT: subtotal renders (`$48.00` for 1× Otoro Selection)

**Artifacts (per iteration):**

- `iter-<N>/acceptance/cuj-1-step-1-menu.png` (SSR menu screenshot)
- `iter-<N>/acceptance/cuj-1-step-3-cart.png`
- `iter-<N>/acceptance/cuj-1-console.log`
- `iter-<N>/acceptance/cuj-1-report.md`

---

## CUJ-2: Admin logs in and loads the admin meals panel

**Persona:** staff member managing menu
**Goal:** authenticate as admin, view the meals admin table, see seeded data
**Preconditions:** admin user seeded, services up

**Steps + assertions:**

1. Navigate to `/auth/login` (or wherever the login route lives — first render step will reveal it)
   - ASSERT: login form visible (email + password fields)
2. Fill `admin@oishi.dev` / `demo-admin-pass`, submit
   - ASSERT: URL no longer `/auth/login`
   - ASSERT (server): `GET /api/auth/me` with the set cookie returns 200 with `role: "ADMIN"`
3. Navigate to `/admin` (the actual route — `apps/web/src/app/app.routes.ts` registers `/admin`, not `/admin/meals`)
   - ASSERT: HTTP 200 (not redirected to /login — admin guard lets through)
   - ASSERT: meal list visible with ≥6 rows
   - ASSERT (DB sanity): `SELECT COUNT(*) FROM "Meal" WHERE "deletedAt" IS NULL` ≥ 6 (skip if `docker compose exec psql` is blocked by session permissions — the UI row count is equivalent evidence)

**Artifacts:**

- `iter-<N>/acceptance/cuj-2-step-1-login.png`
- `iter-<N>/acceptance/cuj-2-step-3-admin-meals.png`
- `iter-<N>/acceptance/cuj-2-console.log`

---

## CUJ-3: Realtime — admin status update propagates to customer's order page

**Persona:** customer tracking live order + admin updating it
**Goal:** verify WebSocket realtime actually moves data end-to-end
**Preconditions:** customer has an active order; admin in another browser context

**Steps + assertions:**

1. Context A (customer): login as `customer@oishi.dev`, create an order via `POST /api/orders` with a cart of 1× Otoro Selection. Capture `order.id`.
   - ASSERT: response 201 with `status: "PENDING"`
2. Context A: navigate to `/orders/<id>` in browser
   - ASSERT: status badge visible showing "PENDING"
3. Context B (admin, new browser context): login as admin. `PATCH /api/admin/orders/<id>` with `{"status":"PREPARING"}`.
   - ASSERT: response 200
4. Back in context A (no page reload)
   - ASSERT within 5s: status badge text changed to "PREPARING"
   - ASSERT: no 5xx in context A's network HAR

**Artifacts:**

- `iter-<N>/acceptance/cuj-3-step-2-pending.png`
- `iter-<N>/acceptance/cuj-3-step-4-preparing.png`
- `iter-<N>/acceptance/cuj-3-network.har`

---

## CUJ-4: Homepage — single-viewport spec layout at 1440×900

**Persona:** first-time visitor landing on `/`
**Goal:** confirm the design spec (`docs/ui-design.md`) is realized: dark editorial canvas, three bands, 6 meal cards in spec order, sommelier input, no scroll
**Preconditions:** seeded DB (6 canonical meals), services up

**Steps + assertions:**

1. Navigate to `http://localhost:4000/` at viewport `1440×900`
   - ASSERT: HTTP 200
   - ASSERT: wordmark "OISHI" visible; amber diamond visible; secondary "SUSHI" visible
   - ASSERT: section meta "— TODAY'S SELECTION" visible in amber
   - ASSERT: exactly 6 `<app-menu-card>` elements
   - ASSERT: meal names in order: Otoro Selection, Chef's Omakase, Toro Truffle Roll, Sashimi Moriawase, Ikura Don, Couple's Set (typographic apostrophes per spec §5.5)
   - ASSERT: sommelier input visible with placeholder starting `"Ask Kenji — what's freshest"`
   - ASSERT: neither `documentElement.scrollHeight > clientHeight + 1` (no vertical scrollbar)
2. Click the "+" button on the first card (Otoro Selection)
   - ASSERT: cart badge appears in header showing `1`
3. Capture full-page screenshot for manual design review

**Artifacts (per iteration):**

- `iter-<N>/acceptance/cuj-4-home-1440x900.png`
- `iter-<N>/acceptance/cuj-4-console.log`

**Run via:** `pnpm nx e2e web-e2e --grep homepage`

---

## Pass criteria (all must hold)

- Every ASSERT green.
- No uncaught exceptions in browser console (warnings OK).
- No 5xx in any network HAR.
- All artifacts written under `iter-<N>/acceptance/`.

## Failure protocol

- First fail: retry the failing CUJ once with a fresh browser context + re-seed.
- Second fail in same iteration: phase NOT complete; append to `STATE.md.blockers` + halt push.
- Same CUJ fails 2 consecutive iterations: write `NEEDS_HUMAN.md` (with screenshots + console + HAR + the failing ASSERT) + halt loop.
