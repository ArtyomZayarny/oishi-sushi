# Plan — Post-loop cleanup (2026-04-24)

Hand-off plan for the other session. Three items surfaced after the overnight autonomous loop finished + the retroactive CUJ-1 pass. All low risk; together they close out the portfolio-app to demo-ready.

**Priority order (do in this sequence):**

1. Meal images (5 min, visual impact)
2. CUJ-2 acceptance (admin flow)
3. CUJ-3 acceptance (realtime)

Each item ships as its own commit with test/impl pair where applicable. No PRs — push directly to main (solo portfolio repo).

**Global conventions (from `CLAUDE.md` and project `CLAUDE.md`):**

- All tasks through `pnpm exec nx run <target>` (never global `nx`, never bare `ng`).
- TDD: test file → red → impl → green → commit pair.
- Before final push of each item: `pnpm exec nx affected -t lint test build` must be green.
- Acceptance artifacts land in `iter-accept-<N>/acceptance/` (gitignored per `.gitignore`).
- Playwright MCP is the driver for CUJs — not headless CLI — because we need screenshots + network HAR interleaved.

---

## Item 1 — Real meal images

**Goal:** `/assets/meals/*.jpg` → 200 OK, six seeded meals render their photos instead of alt text.

**Root cause:** `prisma/seed.ts` references `/assets/meals/salmon-maki.jpg` etc., but `apps/web/public/assets/meals/` does not exist on disk.

**Approach:** commit six real images to `apps/web/public/assets/meals/`. No seed changes needed (URLs already correct). Use free stock photos (unsplash / pexels CC0) to match portfolio tone; downscale to 400×300 WebP → convert to JPG to match the seeded extension. If assets can't be sourced in-session, fall back to `placehold.co/400x300/png?text=<slug>` — one-line change per meal in `prisma/seed.ts` + update to `update: { imageUrl: m.imageUrl }` inside the upsert (current `update: {}` ignores changes to existing rows).

### Execution (real-images path)

1. Source 6 free-use sushi photos → save to `/tmp/meal-src/` as:
   - `salmon-maki.jpg`
   - `tuna-maki.jpg`
   - `salmon-nigiri.jpg`
   - `ebi-nigiri.jpg`
   - `dragon-roll.jpg`
   - `rainbow-roll.jpg`
2. Downscale each to 400×300, JPEG quality 80, strip EXIF:
   ```bash
   mkdir -p apps/web/public/assets/meals
   for f in /tmp/meal-src/*.jpg; do
     name=$(basename "$f")
     ffmpeg -y -i "$f" -vf "scale=400:300:force_original_aspect_ratio=increase,crop=400:300" -q:v 4 "apps/web/public/assets/meals/$name"
   done
   ```
3. Verify files: `ls apps/web/public/assets/meals/ | wc -l` → 6. `file apps/web/public/assets/meals/*.jpg` → all JPEG.
4. Sanity: `pnpm exec nx run web:build` → assets bundled into `dist/`.
5. Runtime check (optional but recommended):
   ```bash
   pnpm exec nx run @org/api:serve &
   pnpm exec nx run web:serve-ssr &
   sleep 25
   curl -fsS -o /dev/null -w "%{http_code}" http://localhost:4000/assets/meals/salmon-maki.jpg
   # expect: 200
   kill %1 %2
   ```

### Commit

```
feat(assets): add seeded meal images

6 × 400×300 JPEG in apps/web/public/assets/meals/, matching seeded imageUrls.
Menu cards now render photos instead of alt text.
```

### Fallback (placehold.co)

If sourcing real images is blocked, edit `prisma/seed.ts`:

- Replace every `imageUrl: '/assets/meals/<slug>.jpg'` with `imageUrl: 'https://placehold.co/400x300/png?text=<Pretty+Name>'`.
- In the `prisma.meal.upsert` call, change `update: {}` → `update: { imageUrl: m.imageUrl }` so existing rows refresh.
- Re-run `pnpm db:seed`.
- Commit: `chore(seed): placeholder images until real assets land`.

Not the preferred path — external dependency on placehold.co for a portfolio demo is weak.

---

## Item 2 — CUJ-2 acceptance (admin login → /admin/meals)

**Goal:** green CUJ-2 pass per `acceptance/cujs.md`, artifacts in `iter-accept-2/acceptance/`.

**Risk area:** admin guard may race the `AuthService.bootstrap()` promise — a direct navigation to `/admin/meals` with a fresh cookie might redirect to `/auth/login` if the guard evaluates before `currentUser.set(user)` completes. If this happens, fix is `provideAppInitializer(() => inject(AuthService).bootstrap())` (should already exist — verify in `app.config.ts`) and/or the guard needs to await the signal.

### Execution

1. **Readiness** (in parallel terminals or as background jobs; see `acceptance/cujs.md` §Readiness):
   ```bash
   pnpm db:up            # postgres up, wait until healthy
   pnpm db:seed          # ensure admin + 6 meals seeded
   pnpm exec nx run @org/api:serve &
   pnpm exec nx run web:serve-ssr &
   # wait for `curl -fsS http://localhost:3000/api` == {"message":"Hello API"}
   # wait for `curl -fsS http://localhost:4000/` == 200
   ```
2. **Run CUJ-2 via Playwright MCP** — step list:
   - `mcp__plugin_playwright_playwright__browser_navigate` → `http://localhost:4000/auth/login`
     - `browser_snapshot` → ASSERT role=textbox[name=email] and [name=password] visible → screenshot to `iter-accept-2/acceptance/cuj-2-step-1-login.png`
   - `browser_fill_form` → email=`admin@oishi.dev`, password=`demo-admin-pass`, submit
     - `browser_wait_for` URL not matching `/auth/login`
     - `browser_network_requests` → find `GET /api/auth/me` → ASSERT status 200 + response body `role: "ADMIN"`
   - `browser_navigate` → `http://localhost:4000/admin/meals`
     - ASSERT not redirected (URL still `/admin/meals`)
     - `browser_snapshot` → ASSERT ≥6 rows in the meal list → screenshot to `cuj-2-step-3-admin-meals.png`
   - DB sanity:
     ```bash
     docker compose exec -T postgres psql -U oishi -d oishi -c \
       'SELECT COUNT(*) FROM "Meal" WHERE "deletedAt" IS NULL;'
     # expect: ≥ 6
     ```
3. **Capture artifacts** — both screenshots, `browser_console_messages` output, and a short `cuj-2-report.md` following `iter-accept-1/cuj-1-report.md` structure.
4. **Unit tests unchanged** — do NOT modify specs. If CUJ-2 fails, root-cause, add a failing unit spec for the bug, fix, commit test+fix pair, re-run.

### Commit (only if bug surfaced)

```
fix(<area>): <one-line description>

Surfaced by CUJ-2: <concrete assertion that failed>. Root cause: <explanation>.
Artifacts: iter-accept-2/acceptance/cuj-2-*.png
```

If CUJ-2 passes on first try, no commit needed — just retain `iter-accept-2/` as local evidence (gitignored per `.gitignore`).

### Tear-down

```bash
kill %1 %2          # api + web-ssr background jobs
pnpm db:down        # optional — leaves data around if you want to debug
```

---

## Item 3 — CUJ-3 acceptance (realtime order status)

**Goal:** green CUJ-3 pass. The most valuable acceptance gate — proves Socket.IO actually wires customer + admin across separate browser contexts.

**Risk area:** cookie-based auth over WebSocket. Socket.IO handshake needs `withCredentials: true` and the server needs to read the JWT from the cookie during namespace/room auth. If CUJ-3 fails at step 4 (no realtime update), likely root causes: (a) socket not joining the user's order-specific room, (b) `PATCH` endpoint not broadcasting, (c) cookie not sent on handshake.

### Execution

1. **Readiness:** same as CUJ-2 (api + web-ssr + seeded DB).
2. **Run CUJ-3 via Playwright MCP** with two browser contexts:
   - **Context A (customer):**
     - `browser_navigate` login → `customer@oishi.dev` / `demo-customer-pass`
     - `browser_run_code` (or raw fetch via browser): `fetch('/api/orders', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items:[{mealId:<salmon-maki-id>, qty:1}]})})` → capture `orderId` from response
     - ASSERT response status 201, `status: "PENDING"`
     - `browser_navigate` → `/orders/<orderId>`
     - `browser_snapshot` → ASSERT badge text "PENDING" → screenshot `cuj-3-step-2-pending.png`
   - **Context B (admin, separate browser context — use `browser_tabs` or a second MCP session):**
     - login as admin
     - `browser_run_code`: `fetch('/api/admin/orders/<orderId>', {method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status:'PREPARING'})})`
     - ASSERT response status 200
   - **Back in Context A:**
     - `browser_wait_for` badge text "PREPARING", timeout 5s
     - ASSERT success, screenshot `cuj-3-step-4-preparing.png`
     - Export network HAR via `browser_network_requests` → `cuj-3-network.har`
     - ASSERT no 5xx in HAR
3. **Capture artifacts:** both screenshots, HAR, `cuj-3-report.md`.

### If CUJ-3 fails

Check in this order:

1. `apps/api/src/orders/orders.gateway.ts` — is `@SubscribeMessage` wired? Does the gateway broadcast on status change?
2. `apps/api/src/orders/orders.service.ts` PATCH path — does it emit `order:status:changed` after DB update?
3. `apps/web/src/app/features/orders/order-tracking.component.ts` — does it subscribe on init with the order-id room?
4. Browser DevTools network: WS connection to `/socket.io/` with 101 Switching Protocols and cookie in the handshake request.

Fix the one that's broken, add a failing unit spec first (for the gateway emit or the component subscription — whichever is the bug surface), then impl. Commit test+fix pair.

---

## Verification before declaring done

After all three items:

```bash
pnpm exec nx run-many -t lint test build
```

Must be green. If not, the commit that broke it is suspect — `git bisect` or just inspect the latest diff.

Then append a short section to `MORNING.md`:

```markdown
## Post-loop cleanup — 2026-04-24 <local time>

- Item 1 (meal images): <DONE | path-taken>
- Item 2 (CUJ-2): <PASS on first try | bug fixed: commit <sha>>
- Item 3 (CUJ-3): <PASS on first try | bug fixed: commit <sha>>

All three CUJs from `acceptance/cujs.md` now green. Portfolio app is demo-ready.
```

---

## Non-goals (do NOT do in this pass)

- `/api/auth/me` 401 "noise" — investigated separately, not a real bug. `error.interceptor.ts:18` already ignores it via `isAuthProbe`. The "red row" in Chrome DevTools is browser-level and cannot be suppressed from app code. If the demo reviewer brings it up, explain: expected behavior for guests probing session on bootstrap.
- Do not refactor seeded data, category structure, or price units. Not in scope.
- Do not bump dependencies. Not in scope.
- Do not change SSR proxy config — CUJ-1 fix already landed in `2f949a4`.

---

## Rollback

All three items commit individually. If any one breaks:

```bash
git revert <sha>
pnpm exec nx run-many -t test build   # confirm green after revert
git push
```

No data migrations, no schema changes — revert is always safe.
