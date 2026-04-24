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

## Next recommended action

1. Review the proxy fix commit (`apps/web/src/server.ts`) — approve or request alternatives (e.g., reverse-proxy in deploy instead of app code).
2. Wire CUJ-2 + CUJ-3 into a throwaway "phase-14-cuj-sanity" pass to fully close the §10 gap retroactively.
3. For next overnight build: `acceptance/cujs.md` + `## Acceptance` blocks per phase are now mandatory (per §10). The overnight-loop template already gates on them at step 6b.
