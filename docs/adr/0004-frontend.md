# ADR-0004: Frontend — Angular (SSR, zoneless, standalone) + Tailwind

## Status

`Accepted`

## Date

2026-04-23

## Context

The entire project exists to demonstrate senior-level Angular. That sounds tautological but it's the actual forcing function: the frontend must showcase Signals (computed + effects), SSR (Universal) on public pages, `@defer` blocks, the new control flow (`@if`, `@for`, `@switch`), standalone components + zoneless change detection, guards + resolvers + interceptors, complex Reactive Forms, NgRx SignalStore, and Socket.IO over authenticated cookies. The framework is not a decision variable; the way we use it is.

Playbook reference: `docs/_playbook/04-frontend-stack.md` ("enterprise SPA with SSR + admin panel → Angular").

## Options considered

### Option A — Angular (latest stable, SSR, zoneless, standalone)

- **Pros:** every demo-feature on the list is first-class Angular (`provideZonelessChangeDetection`, `@defer`, `signalStore`, route-level `loadComponent`, `CanActivateFn`); Nx `@nx/angular:app --ssr` scaffolds the Universal bits; `@angular/platform-server` handles render; Tailwind via `@nx/angular:setup-tailwind` generator; DI model mirrors NestJS so the whole stack reads as one idiom.
- **Cons:** larger initial mental load than React/Vue for casual readers; SSR hydration + httpOnly-cookie auth requires transfer-state or server-side auth check (not hard, just deliberate).
- **Cost / effort:** the portfolio's entire premise; "cost" is table-stakes.
- **Reversibility:** not applicable — the project is defined by this choice.

### Option B — Angular without SSR (SPA-only)

- **Pros:** simpler dev loop (`ng serve`), no transfer state, no server render hydration edge cases, no `@angular/ssr` dependency.
- **Cons:** fails the "SSR ✓" checkbox on the README feature table; the public menu's meta tags and LCP story degrade; loses the `scripts/ensure-services.sh + web:serve-ssr` smoke test in phase 08.
- **Cost / effort:** slightly less scaffolding, materially less impressive.
- **Reversibility:** medium — adding SSR to a mature SPA is painful enough that teams often don't.

### Option C — React + Next.js

- **Pros:** larger hiring market, better-known SSR story, native Server Components.
- **Cons:** doesn't match the candidate profile (this is an Angular portfolio piece); loses the DI parity with NestJS that ADR-0001/0002 lean on; requires different demos for state (Zustand? Redux Toolkit?), realtime, and forms than the ones the playbook has ready.
- **Cost / effort:** re-doing all the phase specs with a different idiom.
- **Reversibility:** pivoting to React means rewriting the whole `apps/web` app.

## Decision

Angular (latest stable via Nx preset) with SSR enabled, standalone components, zoneless change detection, and Tailwind for styling. The framework is non-negotiable per the PRD's target audience (recruiters browsing this as an Angular portfolio).

## Consequences

### Positive

- `provideZonelessChangeDetection()` in `app.config.ts` — signals drive change detection, no Zone.js at runtime.
- `loadComponent` on admin routes keeps the customer bundle small and the admin code out of the public SSR render path.
- `@defer (on viewport) { <app-meal-card-details/> } @placeholder { <app-meal-card-skel/> }` in the menu grid — visible on Lighthouse traces as a deferred chunk.
- Tailwind utility classes keep the design system in markup; no separate CSS files fighting for precedence, no Angular Material runtime cost.
- SSR render is a smoke test in phase 08: `curl http://localhost:4000/menu | grep meal-card` — if SSR breaks, the CI fails loudly.

### Negative / trade-offs we accept

- Zoneless + SSR + httpOnly-cookie auth is the compound edge case that costs phase 07/08 extra care (must attach `withCredentials` on every request including the SSR-side fetch); this is called out in the `AuthInterceptor` test.
- Tailwind + Angular's `ViewEncapsulation.Emulated` plays fine but occasional `::ng-deep` is needed for library components.
- Two initial-render code paths (server + client) mean every component needs to be SSR-safe — no `window`/`document` at module init.

### What this decision forces us to do

- [x] `app.config.ts` provides: `provideRouter`, `provideHttpClient(withFetch(), withInterceptors([...]))`, `provideZonelessChangeDetection`, `provideClientHydration()`.
- [x] `app.config.server.ts` provides: `provideServerRendering`, `provideServerRouting`.
- [x] Every component is `standalone: true` (Nx generator default).
- [x] No Zone.js imports anywhere (`zone.js` still in `package.json` as an Angular peer but never imported by our code).
- [x] Tailwind config extends with the oishi brand palette but stays close to defaults for readability.

## Revisit trigger

- Revisit if the Angular team retires `@defer` or changes the SignalStore API in a breaking way; if the portfolio target shifts to React roles; if a design system requirement (Material 3, Spartan) changes the styling story.

## Links

- Related ADRs: 0001 (architecture), 0002 (backend — DI parity), 0007 (testing)
- PRD section: "Core loop", "In scope (MVP)"
- Playbook ref: `docs/_playbook/04-frontend-stack.md`
