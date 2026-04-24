# CUJ-1 Report (iter-accept-1)

**Status (initial run):** FAIL
**Status (after fix):** PASS
**Phase context:** retroactive acceptance run against `phase: DONE` build.
**Finding:** exactly the "unit-green, product-broken" gap §10 predicts.

## What happened (initial run)

1. Navigated to `http://localhost:4000/menu` → HTTP 200 (SSR served HTML with 12× `data-meal` wrappers; earlier `curl` verified this).
2. Browser hydrated, then client-side Angular re-fetched `/api/menu` and `/api/auth/me`.
3. Both returned 404 (hitting the web server on :4000, not the API on :3000).
4. `MenuComponent` flipped to empty-state: "Menu is currently being updated. Check back soon."

### Artifact (before fix)
- Screenshot: `iter-accept-1/cuj-1-step-1-menu-FAIL.png`

### Console errors (before fix)
```
[ERROR] 404 @ http://localhost:4000/api/auth/me
[ERROR] 404 @ http://localhost:4000/api/menu
```

## Root cause

`apps/web/src/services/menu.service.ts` defines browser-default `API_BASE_URL = '/api'` (relative). `app.config.server.ts` overrides with absolute URL for SSR only. The Angular SSR Express server (`apps/web/src/server.ts`) had no proxy for `/api/*` — only a commented example. `proxy.conf.json` is consumed by `ng serve` (dev) but NOT by the compiled `server.mjs` at runtime.

## Fix applied

Added `http-proxy-middleware` to `apps/web/src/server.ts`:
- `/api/*` → `http://localhost:3000/api`
- `/socket.io/*` → `http://localhost:3000` (with `ws: true` for WebSocket upgrade)

Target base controllable via `API_PROXY_TARGET` env var for deploy flexibility.

Rebuilt + restarted `web:serve-ssr` and re-ran the CUJ.

## What happened (after fix)

1. Navigated to `http://localhost:4000/menu` → HTTP 200.
2. Page rendered:
   - **Maki** section: Salmon Maki ($8.90) + Tuna Maki ($9.90), both with Add buttons.
   - **Nigiri** + **Special Rolls**: `@defer on viewport` skeletons (will load on scroll — intended).
3. Clicked Add on Salmon Maki → cart badge updated: `Cart 1`.
4. Navigated to `/cart` → lists Salmon Maki qty 1, subtotal $8.90, tax $1.34 (15%), total $10.24.

### Artifacts (after fix)
- `iter-accept-1/cuj-1-step-1-menu-PASS.png`
- `iter-accept-1/cuj-1-step-3-cart.png`

### Remaining console noise (non-blockers)
- `401 @ /api/auth/me` — expected (no auth cookie on unauthenticated visit). Could be silenced by using an `error` interceptor that swallows 401 on that specific endpoint.
- `404 @ /assets/meals/salmon-maki.jpg` + `tuna-maki.jpg` — missing image assets in `apps/web/public/assets/meals/`. Cosmetic; meals render with alt text.

## ASSERT table

| # | Assertion | Before fix | After fix |
|---|-----------|-----------|-----------|
| 1 | `/menu` HTTP 200 | PASS | PASS |
| 2 | Page contains `data-meal` (SSR) | PASS | PASS |
| 3 | "Salmon Maki" visible in DOM (after hydration) | **FAIL** | PASS |
| 4 | Click "Add" on Salmon Maki, cart badge → `1` | unrunnable | PASS |
| 5 | `/cart` lists Salmon Maki qty 1 | unrunnable | PASS |
| 6 | Subtotal `$8.90` | unrunnable | PASS |

## Why unit tests + build + SSR curl check all passed but product was broken

- `pnpm nx test web` uses `HttpTestingController`. Never hits a real URL — flushes the request with mocked data.
- `pnpm nx build web` compiles both bundles — nothing in the compile path sees runtime routing.
- Earlier `curl http://localhost:4000/menu` saw SSR-rendered HTML with meal cards → reported "SSR works" — but did not drive the browser past hydration, where the client re-fetch fails.

This is precisely the footgun §10 is designed to catch. The overnight loop shipped "green" 13 times. CUJ-1 caught the actual product breakage on its first run.

## Outcome

Fix committed as part of this acceptance pass (`feat(acceptance): SSR /api proxy + CUJ infrastructure`).
