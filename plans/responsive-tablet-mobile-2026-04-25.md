---
slug: responsive-tablet-mobile
date: 2026-04-25
status: draft
owner: tba
---

# Responsive overhaul — tablet & mobile

## Context

Today the site has **two design systems**:

1. **Home** (`apps/web/src/app/pages/home/home.component.ts:82`) is a fixed 1440×900 canvas, JS-scaled to fit, gated behind `viewportTooSmall` (max-width: 767px) — phones see _only_ a "desktop-only" fallback message; tablets get the canvas scaled down to ~67% which makes 12px body text render at ~8px. Cards (`apps/web/src/app/features/home/components/menu-card/menu-card.component.ts:26`) hard-code `w-[440px] h-[300px] grid-cols-[200px_240px]` — they cannot reflow.
2. **Everything else** (menu, cart, checkout, login, tracking) uses Tailwind responsive utilities (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `max-w-md`, `max-w-6xl`) — they _probably_ work on phone but were never designed or tested there.

Critical missing pieces:

- App-shell `<nav>` (`apps/web/src/app/layout/app-layout.component.ts:14-60`) is a horizontal `<ul flex gap-4>` with **no hamburger / no collapse** → overflows below ~480px.
- No mobile e2e anywhere. All Playwright specs pin to 1280×720, 1280×800, or 1440×900.
- Sommelier input (`sommelier-input.component.ts:23`) has hard-coded 36px gaps that wrap badly on narrow widths.

## Constraints

| #   | Constraint                                                                                                                                          | Source                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| C1  | Desktop home **must** stay pixel-equal to the 1440×900 spec — `home.spec.ts` asserts no vertical scrollbar at that viewport.                        | `apps/web-e2e/src/home.spec.ts:66-73` |
| C2  | Desktop spec meal order, wordmark, and section meta must remain identical.                                                                          | `home.spec.ts:14-40`                  |
| C3  | Hard breakpoints: phone `<768`, tablet `768–1199`, desktop `≥1200`. (Matches existing home gate threshold.)                                         | user brief                            |
| C4  | Touch targets ≥ 44×44 px on mobile.                                                                                                                 | WCAG / user brief                     |
| C5  | Mobile body text ≥ 14px. No global scale-to-fit shrink.                                                                                             | user brief                            |
| C6  | Tailwind 3.0.2 default breakpoints (sm 640, md 768, lg 1024, xl 1280, 2xl 1536). Don't introduce custom theme breakpoints — easier to remove later. | `apps/web/tailwind.config.js`         |
| C7  | Admin (`/admin/*`) stays desktop-gated. Out of scope for mobile.                                                                                    | user brief                            |
| C8  | No regressions in 161 unit tests + existing 7 home e2e tests.                                                                                       | current main                          |

## Approach

**Hybrid layout per route, not a single fluid system.**

- **Home desktop (≥1200)** keeps the 1440×900 fixed canvas exactly as-is. The current scale-to-fit logic stays for 1200-1439 desktop laptops.
- **Home tablet/mobile (<1200)** swaps to a _new, mobile-first_ template — vertically stacked, real Tailwind grid, native scroll. Same six cards, same data, _different layout_. Selected via the existing `matchMedia` signal.
- **Menu / cart / checkout / login / tracking** keep their Tailwind grids; the work is design polish + mobile e2e + fixing the app-shell nav.
- **App-shell** gains a hamburger drawer below `md` (768px). Plus a **sticky bottom cart bar** when cart has items — recovers the cart-CTA visibility the desktop top-right icon loses on mobile.

**Why this over alternatives**:

- _Pure fluid scale-to-fit_ (current home approach extended): fails C5 — text shrinks below readable.
- _Single mobile-first redesign of home_: violates C1 — would force a redesign of the desktop spec.
- _Drop mobile and gate everything_: violates the user's stated goal.
- _Container queries_: Tailwind 3.0 doesn't ship them as utilities; would need a plugin and would be the only place we use it. Defer.

**Mobile nav pick**: hamburger drawer (top-left, slides in from left) + sticky bottom cart bar (shows on `<md` whenever `cartCount() > 0`, contains the "View cart · $XX" CTA). Standard e-commerce pattern; minimal new components; the bottom bar gives the cart parity with the desktop top-right icon.

## Phases

Each phase ends with green tests at three viewports: **390×844 (iPhone 12)**, **768×1024 (iPad portrait)**, **1440×900 (desktop spec)**. New e2e files live alongside existing ones in `apps/web-e2e/src/`.

### Phase 0 — Foundation (no UI change)

**Goal**: lay the test infrastructure and primitives so every later phase can verify itself.

| File                                                     | Change                                                                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web-e2e/src/_viewports.ts` (new)                   | Export `MOBILE = { width: 390, height: 844 }`, `TABLET = { width: 768, height: 1024 }`, `DESKTOP = { width: 1440, height: 900 }`.                                                      |
| `apps/web-e2e/src/_responsive-helpers.ts` (new)          | Export `assertNoHorizontalScroll(page)`, `assertTouchTargets(page, selector)` (asserts each matched element is ≥44×44).                                                                |
| `apps/web/src/app/shared/viewport.service.ts` (new)      | Standalone `inject()`-able service exposing `isPhone()`, `isTablet()`, `isDesktop()` signals derived from `matchMedia`. Replaces ad-hoc `viewportTooSmall` in `home.component.ts:214`. |
| `apps/web/src/app/shared/viewport.service.spec.ts` (new) | Unit test covering all three matches + change events.                                                                                                                                  |

**Acceptance**: Phase 0 has no visible change. Verify only via the new unit test + `pnpm nx lint web`.

### Phase 1 — Mobile/tablet home layout

**Goal**: render the six meal cards as a real, scrollable, native-resolution layout below 1200px.

| File                                                                                     | Change                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/pages/home/home.component.ts`                                          | Split template by viewport. Branch on `viewport.isDesktop()`: desktop branch is the existing 1440×900 canvas (untouched). Tablet/mobile branch renders header (hamburger + wordmark + cart icon) → "TODAY'S SELECTION" eyebrow → vertical 1-col (mobile) / 2-col (tablet) grid of cards → sommelier section → footer. Drop the `viewportTooSmall` "desktop-only" gate. |
| `apps/web/src/app/features/home/components/menu-card/menu-card.component.ts`             | Add an input `variant: 'desktop' \| 'mobile' = 'desktop'`. `desktop` keeps current `w-[440px] h-[300px] grid-cols-[200px_240px]`. `mobile` is `w-full` with image-on-top (16:9 ratio) and content below; touch target ≥44px on the `+` button.                                                                                                                         |
| `apps/web/src/app/features/home/components/sommelier-input/sommelier-input.component.ts` | Wrap the label + tagline in `flex-col gap-2 sm:flex-row sm:gap-9`. Make input height 48px on mobile, keep 50px desktop.                                                                                                                                                                                                                                                |
| `apps/web-e2e/src/home-mobile.spec.ts` (new)                                             | At MOBILE + TABLET: no horizontal scroll, all 6 spec meal names visible (scroll into view if needed), cart icon tappable (≥44px), hamburger opens drawer.                                                                                                                                                                                                              |

**Acceptance**:

- Existing `home.spec.ts` (DESKTOP) — 7/7 still green.
- New `home-mobile.spec.ts` — passes at MOBILE and TABLET.
- Visual: at MOBILE the screenshot shows full cards + readable 14px body text (no shrink). At TABLET the cards are 2-up. At DESKTOP the canvas is byte-identical to today's `home-1440x900.png` snapshot.

### Phase 2 — App-shell mobile nav

**Goal**: every non-home route is reachable on phone via a real nav drawer; cart CTA is always visible.

| File                                                           | Change                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/layout/app-layout.component.ts`              | Replace the `<ul flex gap-4>` with: desktop (`md:flex`) nav unchanged; mobile (`<md`) shows a hamburger button that toggles a drawer. Drawer animates in from the left, contains the same nav items stacked, plus a close button. Trap focus while open; close on route change. |
| `apps/web/src/app/layout/mobile-nav-drawer.component.ts` (new) | Standalone component; props: `open`, `(close)`. Renders `<dialog>` with `role="dialog" aria-modal="true"`. Backdrop click closes. Tab focus trap.                                                                                                                               |
| `apps/web/src/app/layout/sticky-cart-bar.component.ts` (new)   | Sticky bottom (`<md` only) CTA. Visible iff `cartStore.totalQuantity() > 0`. Shows count + total + arrow. Routes to `/cart`.                                                                                                                                                    |
| `apps/web/src/app/layout/app-layout.component.ts`              | Mount `<sticky-cart-bar>` at the bottom of the layout shell.                                                                                                                                                                                                                    |
| `apps/web-e2e/src/mobile-nav.spec.ts` (new)                    | At MOBILE: hamburger is visible, drawer opens on tap, contains all 4 nav links, closes on link click. At DESKTOP: hamburger is hidden, original nav is visible. Sticky cart bar appears after adding an item, hides at DESKTOP.                                                 |
| `apps/web/src/app/layout/app-layout.component.spec.ts` (new)   | Unit test for hamburger toggle + drawer focus trap.                                                                                                                                                                                                                             |

**Acceptance**:

- All 3 viewports: nav reachable, no horizontal overflow.
- Mobile: hamburger touch target ≥44px, drawer accessibility checks pass (axe-core via Playwright optional but recommended).
- Desktop: nav looks unchanged from today.

### Phase 3 — Menu, cart, checkout polish + mobile e2e

**Goal**: the existing fluid-grid routes are _intentionally_ mobile-friendly, not just accidentally.

| File                                                             | Change                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/pages/menu/menu.component.ts`                  | Audit `MealCardDetailsComponent` (nested) — ensure card body wraps cleanly at <640px. Likely just adds `min-w-0` on the text container. |
| `apps/web/src/app/pages/menu/...` (mealcard child)               | If image is fixed-width, change to `w-full sm:w-32` aspect-ratio constrained.                                                           |
| `apps/web/src/app/features/cart/cart.component.ts`               | Replace fixed `h-14 w-14` thumbnail with `h-16 w-16 sm:h-14 sm:w-14`. Stack qty controls vertically below text on `<sm`.                |
| `apps/web/src/app/features/checkout/checkout.component.ts`       | Change `lg:grid-cols-[2fr_1fr]` → `md:grid-cols-[2fr_1fr]` so iPad lands two-column. Audit input padding under 640px.                   |
| `apps/web/src/app/pages/login/login.component.ts`                | `max-w-md py-10` → `max-w-md py-6 sm:py-10`. Form spacing pass.                                                                         |
| `apps/web/src/app/features/tracking/order-tracking.component.ts` | Visual pass only — header sizes, status pill wrapping.                                                                                  |
| `apps/web-e2e/src/menu-mobile.spec.ts` (new)                     | MOBILE + TABLET: 1-col / 2-col / 3-col cascade as expected; "Add" button ≥44px.                                                         |
| `apps/web-e2e/src/cart-mobile.spec.ts` (new)                     | MOBILE: line items stack legibly, qty buttons tappable.                                                                                 |
| `apps/web-e2e/src/checkout-mobile.spec.ts` (new)                 | MOBILE: form fields are full-width, "Place order" CTA reachable above keyboard (sticky-ish or just the bottom of the scroll).           |

**Acceptance**: every spec viewport (3 each, x4 routes = 12 e2e cases) passes; no horizontal scroll; min-touch-target asserts pass.

### Phase 4 — Admin gate

| File                                                    | Change                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/pages/admin/admin-meals.component.ts` | Wrap template in the same `viewportTooSmall` style gate (now via `viewport.isDesktop()` from Phase 0). Below 1200px, show "Admin is desktop-only — please use a larger screen." |
| `apps/web/src/app/pages/admin/meal-editor.component.ts` | Same.                                                                                                                                                                           |
| `apps/web-e2e/src/admin-mobile.spec.ts` (new)           | MOBILE: gate message visible, no admin grid rendered.                                                                                                                           |

**Acceptance**: admin renders only on desktop; existing admin desktop e2e tests untouched.

### Phase 5 — Polish & docs

| File                                | Change                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/responsive.md` (new)          | Short doc: breakpoint table, mobile nav pattern, where the home dual-layout split lives, how to add a new route to the responsive coverage.                |
| `apps/web-e2e/playwright.config.ts` | Add a `projects: [...desktop, mobile, tablet]` matrix so CI runs the responsive suite as a separate project. (Optional — bench against CI runtime budget.) |

## Tests (TDD order, per CLAUDE.md §7)

For each phase, write the failing e2e first:

1. **Phase 0**: viewport service unit test — RED, then GREEN.
2. **Phase 1**: `home-mobile.spec.ts` written first against current home → fails (gate shows "desktop-only" message). Implement layout split → green.
3. **Phase 2**: `mobile-nav.spec.ts` written first → fails (no hamburger). Build drawer → green. Same for sticky-cart-bar.
4. **Phase 3**: each `*-mobile.spec.ts` written first; identifies the actual layout breakage (e.g. button too small at 390px); polish CSS until green.
5. **Phase 4**: `admin-mobile.spec.ts` red (admin renders) → add gate → green.

Unit tests must stay green throughout. Run `pnpm nx test web` after every phase.

## Verification

End-to-end, after Phase 5:

```bash
# 1. Unit
pnpm nx test web                 # 161+ tests, all green
pnpm nx test @org/api            # unaffected, sanity check
# 2. Lint + typecheck
pnpm nx lint web
pnpm exec tsc --noEmit -p apps/web/tsconfig.app.json
# 3. E2e — full responsive matrix
pnpm nx e2e web-e2e
# 4. Production build
pnpm nx build web
```

Manual visual sweep at three viewports per route. Capture before/after via `bash scripts/capture-screenshots.sh` (already exists).

Acceptance per CLAUDE.md §10: each phase's `acceptance` block above is the gate before the phase's commit. Don't advance until 3-viewport e2e is green for the routes touched in that phase.

## Risks

| #   | Risk                                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Desktop home spec ("no scroll at 1440×900") was the design source-of-truth. Adding a mobile branch isn't a regression of the spec, but **the spec doc may need updating** to acknowledge that mobile/tablet exists at all and is intentionally a different layout.      | Coordinate with the spec owner before Phase 1 lands. The CUJ-4 acceptance file (referenced in commit `b5e46ee`) likely needs an addendum: desktop spec is the canonical "single viewport" experience; mobile is a derivative. |
| R2  | Users who today see "Oishi Sushi is desktop-only" message will, after Phase 1, see real content on phone. If a stakeholder is using that message as a signal ("we're in a controlled rollout"), they need a heads-up.                                                   | Surface in the Phase 1 PR description.                                                                                                                                                                                        |
| R3  | MenuCardComponent has data-attributes used by `home.spec.ts:24-31` (`[data-meal-name]`, `[data-add-button]`). The `variant: 'mobile'` template must keep all the same `data-*` hooks so existing desktop e2e remains green and so we can reuse selectors in mobile e2e. | Lock the data-attribute contract in the component spec; add a unit test asserting both variants emit the same data-attrs.                                                                                                     |
| R4  | Admin gate (Phase 4) will lock out staff who currently use admin from a tablet.                                                                                                                                                                                         | Confirm with whoever owns admin (per `STATE.md` phase 12 notes). If tablet is needed, scope admin to ≥768 instead of ≥1200.                                                                                                   |
| R5  | Sticky bottom cart bar overlaps the iOS Safari home indicator / tabbar.                                                                                                                                                                                                 | Use `padding-bottom: env(safe-area-inset-bottom)` on the bar. Add to Phase 2 styles.                                                                                                                                          |
| R6  | Tailwind 3.0 is approaching EOL; container queries and modern features land in 3.4+.                                                                                                                                                                                    | Out of scope for this plan. If we end up wanting `@container` queries during Phase 1, treat it as a separate "upgrade Tailwind" plan first.                                                                                   |

## Rollback

Each phase ships as a single PR with all its files. Reverting a phase = reverting one merge commit. The `home.component.ts` desktop branch is preserved verbatim through Phase 1, so reverting the mobile work does not touch the desktop layout.

If Phase 1 lands and stakeholder pushback arrives, the cheapest revert is restoring the `viewportTooSmall` gate (one-line change reverting `home.component.ts`'s viewport branch) without un-shipping the new mobile layout from the codebase. Then iterate on the messaging.

## Open questions before kickoff

1. **Spec ownership** — who signs off that mobile home is allowed to deviate from the 1440×900 fixed-canvas spec? (R1)
2. **Admin on tablet** — required, or genuinely desktop-only? (R4)
3. **Order tracking** — does it have any data states beyond "PENDING/CONFIRMED/READY/DELIVERED" that need bespoke mobile UI? Audit needed before Phase 3 final.
4. **Sticky cart bar behavior on `/cart` itself** — show or hide? (Probably hide, to avoid visual duplication.)
