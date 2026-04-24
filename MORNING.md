# Overnight Build — Morning Summary

## TL;DR

- **Loop state:** LOOP COMPLETE (2026-04-24 02:14 local)
- **Phases done:** 13 of 13
- **Commits on main:** 28 (scaffold + plan + 13 × test/feat pairs + state advances + polish)
- **Wall time:** 2h 44min (23:30 → 02:14)
- **Unit tests:** 46 api + 115 web + 31 validators = **192 green**

## BUT — initial acceptance run caught a production bug the loop missed

**First retroactive CUJ pass (iter-accept-1) surfaced:** `/api/*` proxy was missing on the SSR Express server. All 192 unit tests passed and `curl` against SSR HTML showed meal cards, so the loop shipped it green. But an actual browser hydration + client-side fetch → **404 on `/api/menu`** → UI flipped to empty state "Menu is currently being updated."

This is the exact failure mode §10 ("Code-green ≠ Product-works") was written to prevent. §10 works.

## What to check first

1. `iter-accept-1/cuj-1-report.md` — full before/after with screenshots + ASSERT table.
2. `iter-accept-1/cuj-1-step-1-menu-FAIL.png` — product-broken evidence.
3. `iter-accept-1/cuj-1-step-1-menu-PASS.png` + `cuj-1-step-3-cart.png` — product-works-after-fix evidence.
4. `git log --oneline -5` — the proxy fix commit.

## Iteration log (newest first)

### iter-accept-1 — 2026-04-24 03:53 → 03:58 — CUJ-1 — FAIL then PASS (after fix)

- **Unit verify:** all 192 tests still green after the fix.
- **Phase acceptance (retroactive):** N/A — build was already at `phase: DONE`; acceptance infrastructure (`acceptance/cujs.md`, `scripts/acceptance.sh`) drafted during this pass.
- **CUJ-1 (guest browses menu + adds to cart):**
  - First run: FAIL at ASSERT "Salmon Maki visible in DOM after hydration" — root cause: no `/api` proxy on SSR server.
  - Fix: added `http-proxy-middleware` to `apps/web/src/server.ts` for `/api/*` + `/socket.io/*`.
  - Retry: PASS. Cart badge → `1`, subtotal $8.90, tax $1.34, total $10.24.
- **CUJ-2 (admin logs in, loads /admin/meals):** not run yet — infrastructure present in `acceptance/cujs.md`.
- **CUJ-3 (realtime: admin status patch → customer tab badge updates):** not run yet.
- **Outcome:** proxy bug fixed + committed. `acceptance/cujs.md` + `scripts/acceptance.sh` seeded for future runs. CUJs 2-3 can be exercised on-demand or wired into a future phase's acceptance block.

## Known gaps / cosmetic

- `GET /api/auth/me` returns 401 to unauthenticated visitors and the error interceptor logs it as console noise. Consider swallowing 401 on that specific endpoint.
- `/assets/meals/*.jpg` 404s — seed uses image URLs that don't exist on disk. Cosmetic; meals render with alt text. Fix by either adding images to `apps/web/public/assets/meals/` or changing seed to use placeholder service (e.g. `https://placehold.co/400x300?text=Salmon+Maki`).

## Commits added

```
<TBD after commit>  feat(acceptance): SSR /api proxy + CUJ infrastructure + MORNING.md
7014341             chore: loop DONE
cb8e78e             feat(13-polish): README + CI workflow + screenshots + missing app glue
9f99506             test(13-e2e): 3 Playwright specs (customer / admin / realtime)
...
```

## Files created outside the repo

- `iter-accept-1/` — retained this time as evidence of the §10 workflow. Future runs should gitignore `iter-*/` (already added).

## Post-loop cleanup — 2026-04-24 ~07:55 local

Executed `plans/post-loop-cleanup-2026-04-24.md`. All three items closed:

- **Item 1 (meal images): DONE** — commit `f057eee`. 6 × 400×300 Unsplash JPEGs mapped into `apps/web/public/assets/meals/`. Build succeeds, assets bundle into `dist/apps/web/browser/assets/meals/`.
- **Item 2 (CUJ-2): PASS** — commit `7d6ffed`. Login → `/admin` → 6 meal rows with images rendering. Full report in `iter-accept-2/acceptance/cuj-2-report.md`. One doc fix: CUJ-2 spec said `/admin/meals` but actual route is `/admin`; `acceptance/cujs.md` updated.
- **Item 3 (CUJ-3): PASS** — commit pending. Customer creates order, admin PATCHes status, customer's browser flips badge PENDING → PREPARING in ≤5s without reload. Full report in `iter-accept-3/acceptance/cuj-3-report.md`.

### Second bug caught by the §10 acceptance workflow (and fixed during iter-accept-3)

Running CUJ-3 surfaced a structurally identical bug to the one iter-accept-1 found: the SSR server's `/socket.io` proxy was mounted with `target: apiOrigin` instead of `target: ${apiOrigin}/socket.io`. Express strips the mount prefix, so Engine.IO polling hit `/?EIO=4...` on the backend and 404'd. Unit tests (192 green) never touched it because `server.ts` is bootstrap config. Fix is a one-line change, symmetric to the `/api` fix from commit `2f949a4`.

**Two consecutive retroactive CUJ passes → two proxy bugs fixed.** This concretely validates §10: "code-green ≠ product-works". Worth capturing the pattern (`http-proxy-middleware` at a prefix that matches the backend's path → target MUST include that prefix) in the project's docs for any future proxy routes.

### /auth/me 401 "noise" — investigated, not actionable

MORNING.md's top section listed `GET /api/auth/me → 401` as "console noise". Investigated in post-loop pass: the error interceptor at `apps/web/src/app/interceptors/error.interceptor.ts:18` already skips 401 for `/auth/me` and `/auth/login` via `isAuthProbe()`, and `auth.service.ts:28–38` swallows the error silently. The "noise" is Chrome DevTools' auto-red-row in the Network panel for any 4xx response — unsuppressable from app code. Not a bug; expected guest-probe behavior.

## Status

All three CUJs in `acceptance/cujs.md` now green. Portfolio app is demo-ready.
