# UI Design Match — Homepage Redesign

**Date:** 2026-04-24
**Spec:** `docs/ui-design.md` (homepage design specification)
**Reference mockup:** `docs/Oishi Sushi.html` (SVG, source of truth for pixel positions)

---

## 1. Goal

Bring the current web app into pixel alignment with the homepage design specification. The spec defines a **single-viewport, desktop-only, 1440×900, no-scroll homepage** with three horizontal bands:

1. **Header** (0→56) — wordmark, nav, cart badge
2. **Menu grid** (56→780) — 3×2 cards of 440×300, the hero content
3. **Sommelier AI** (780→900) — input for Kenji + meta line

Other routes (`/menu`, `/cart`, `/checkout`, `/tracking`, `/admin`) remain on the existing Tailwind chrome for V1. Dark-theme rollout to those routes is an explicit non-goal.

## 2. Scope

**In scope:**

- Design token foundation (CSS custom properties, Tailwind theme, Google Fonts, Lucide icons)
- Seed data realignment — 6 spec meals replacing 6 existing meals
- Image asset renaming + fallback to solid-color blocks when files missing
- New `MenuCard` primitive matching §5.3 exactly
- New `HomeComponent` bypassing `AppLayoutComponent`, rendering the three bands
- Cart store wiring (badge digit, meta line)
- Sommelier input UI stub (UI only, backend deferred)
- A11y (focus rings, sr-only label, below-1200px desktop-only notice)
- Playwright acceptance test at 1440×900

**Out of scope (follow-up work):**

- Sommelier RAG backend implementation
- Real photography
- Responsive / mobile
- Dark-theme rollout to non-home routes
- Streaming chat response surface
- Admin-panel impact (the admin meal editor will still work with renamed meals)

## 3. Gap analysis — audit findings

| Area          | Current state                                                                       | Spec state                                                                                                    | Delta                                                |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Homepage      | `pages/home/home.component.ts`: Tailwind hero "Fresh sushi, fast" → link to `/menu` | Three-band dark layout, 6 cards, sommelier input                                                              | **Total replacement**                                |
| Palette       | Tailwind defaults (`slate-*`, `white`)                                              | `#0A0A0A / #14110D / #1F1D1A / #2A2723 / #F5F1EA / #8A8279 / #D4803A / #E89550 / #3D2F1F / #4A3A28 / #2E2820` | New CSS custom properties + Tailwind extends         |
| Fonts         | No custom fonts loaded                                                              | Fraunces (300, 500) + Inter (400, 500, 600) from Google Fonts                                                 | Add `<link>` to `index.html` + Tailwind `fontFamily` |
| Icons         | No icon library installed                                                           | Lucide (`ShoppingBag`, `ArrowUp`)                                                                             | Install `lucide-angular`, register icons             |
| Layout        | `AppLayoutComponent` wraps every route (responsive header + footer)                 | Homepage renders its own integrated chrome                                                                    | Home bypasses `AppLayoutComponent`                   |
| Seed          | Salmon Maki / Tuna Maki / Salmon Nigiri / Ebi Nigiri / Dragon Roll / Rainbow Roll   | Otoro Selection / Chef's Omakase / Toro Truffle Roll / Sashimi Moriawase / Ikura Don / Couple's Set           | Rewrite 6 rows in `prisma/seed.ts`                   |
| Meal images   | `apps/web/public/assets/meals/{salmon-maki,tuna-maki,…}.jpg`                        | New filenames matching new slugs                                                                              | Delete old, use solid-color fallbacks for V1         |
| Test fixtures | 6 `.spec.ts` files reference existing meal names                                    | Must match new data                                                                                           | Update per-file (see §7.4)                           |
| Cart badge    | Wired to `CartStore` count, styled generically                                      | Amber circle at (1392, 28), digit in `--canvas`, Inter 10/600                                                 | Restyle in home's header band                        |
| Sommelier     | **Nothing** exists (UI or backend)                                                  | 50px input + meta line with live cart totals                                                                  | New UI component; backend deferred                   |

## 4. Architectural decisions

### 4.1 Homepage bypasses AppLayoutComponent

The spec's header band integrates wordmark, nav, and cart at specific coordinates that don't match `AppLayoutComponent`'s responsive header. Forcing `AppLayoutComponent` to switch themes based on route introduces conditional logic that will rot.

**Decision:** Home route renders its own chrome. `AppLayoutComponent` continues to wrap all other routes. Follow-up work can consolidate after the dark-theme rollout decision is made.

### 4.2 Global tokens, scoped canvas

CSS custom properties (palette, font families) go in `styles.css` — globally available. But `html, body { background: <canvas> }` would affect non-home routes. **Decision:** Apply canvas background on a `.canvas` class scoped to the `HomeComponent`'s root. Non-home routes stay Tailwind-default.

### 4.3 Tailwind stays; custom properties supplement

Every current page uses Tailwind. Ripping it out now is scope creep. **Decision:** Extend Tailwind theme with the spec palette + font families so class names (`bg-canvas`, `text-text-primary`, `font-display`) work. Raw CSS custom properties also defined for pixel-precise absolute positioning in `.css` files.

### 4.4 V1 uses solid-color image fallbacks

Real photography is not available. The spec itself says "in production this is where the real photograph renders; the solid color becomes the loading/fallback state." **Decision:** V1 renders just the solid `--photo-{umber,sepia,stone}` block with no `<img>`. When photography lands, a follow-up PR adds `<img>` with `object-fit: cover` and the solid color stays as CSS `background-color` under the image.

### 4.5 Sommelier backend deferred

The spec marks the response surface "TBD, not in v1" and the input spec as "wire up to sommelier/RAG endpoint." **Decision:** V1 UI-only. On Enter/click, show the 3-dot amber ellipsis for 1.5s then reset to placeholder. Log the query to console. Backend scaffolding waits for explicit user go-ahead.

## 5. Phased plan

Each phase ends with a verifiable outcome and a commit. Commits land on `main` sequentially; no long-lived branch.

### Phase 1 — Foundation (tokens, fonts, icons)

**Files to add/modify:**

- `apps/web/src/index.html` — add the Google Fonts `<link>` per §3.2
- `apps/web/src/styles.css` — add `:root { --canvas: …; …; }` block for the 11 spec colors; add `font-variant-numeric: tabular-nums` utility class for prices
- `apps/web/tailwind.config.js` — extend `theme.extend.colors` with the spec palette; `theme.extend.fontFamily` with `display: ['Fraunces', 'serif']` and `sans: ['Inter', 'sans-serif']`
- `apps/web/package.json` — add `lucide-angular` dependency
- `apps/web/src/app/app.config.ts` — register `LucideAngularModule.pick({ ShoppingBag, ArrowUp })`

**Install:** `pnpm -w add lucide-angular --filter web` (verify syntax via `pnpm --help` / nx docs; alternative: `pnpm add lucide-angular` at workspace root)

**Acceptance:**

- `pnpm nx build web` succeeds
- `pnpm nx serve web` → `view-source` shows `fonts.googleapis.com/css2?family=Fraunces…`
- Tailwind class `bg-canvas` produces `background-color: rgb(10 10 10)` in DOM
- `document.styleSheets[0].cssRules` contains `--amber: #D4803A`

### Phase 2 — Seed & asset realignment

**Files:**

- `prisma/seed.ts` — replace the 6 existing meals with the spec meals. Keep the categories (NIGIRI, OMAKASE, MAKI, SASHIMI, DONBURI, SETS); note OMAKASE, DONBURI, SETS are new categories that need inserting. Price field format: spec uses `$48` (integer USD); current seed uses `8.90` (decimal). Preserve the existing schema — store as decimal `48.00`.
- `apps/web/public/assets/meals/` — delete old files; no new files for V1 (see §4.4)
- `prisma/schema.prisma` — inspect to confirm category is a separate table; if so, may need cleanup of unreferenced categories
- Test fixtures (see §7.4) — update name assertions across 6 spec files

**Reseed protocol:**

```bash
# stop services, wipe volume, re-up, re-seed
pnpm nx run api:seed:reset  # if target exists; else: prisma migrate reset --force && prisma db seed
```

**Acceptance:**

- `curl http://localhost:3000/api/menu` returns 6 meals with names: Otoro Selection, Chef's Omakase, Toro Truffle Roll, Sashimi Moriawase, Ikura Don, Couple's Set
- Prices match: 48, 95, 38, 72, 32, 128
- `pnpm nx test api` passes
- `pnpm nx test web` passes (after Phase-2 test fixture updates)

### Phase 3 — MenuCard primitive

**Files to add:**

- `apps/web/src/app/features/home/components/menu-card/menu-card.component.ts` — standalone
- `apps/web/src/app/features/home/components/menu-card/menu-card.component.css`
- `apps/web/src/app/features/home/components/menu-card/menu-card.component.spec.ts`

**Component API (inputs/outputs):**

```ts
@Input({ required: true }) label!: string;           // e.g. 'NIGIRI'
@Input({ required: true }) name!: string;            // e.g. 'Otoro Selection'
@Input({ required: true }) description!: string;
@Input({ required: true }) price!: number;           // e.g. 48
@Input({ required: true }) timeMin!: number;         // e.g. 25
@Input({ required: true }) photoFill!: 'umber' | 'sepia' | 'stone';
@Input() imageSrc?: string;                          // future: real photo
@Output() addToCart = new EventEmitter<void>();
```

**Layout:**

- Outer: `440×300`, `background-color: var(--card-lifted)`, `border: 1px solid var(--hairline)`, `border-radius: 2px`
- CSS Grid: `grid-template-columns: 200px 240px`
- Image zone: solid `var(--photo-{fill})`; inset 16/16 category label Inter 9/500 uppercase tracking 1.5 `rgba(138,130,121,0.7)`
- Content zone: `padding: 64px 16px 12px 16px` (approximate) using absolute positioning for pixel-precise offsets per §5.3 table
- 24×1 amber underline rendered as `<div>` with `background: var(--amber)`
- "+" button: 32×32, 2px radius, 1px amber border, transparent fill; glyph is two pseudo-elements (12px × 1.5px amber bars, centered)

**States per §5.4:**

- `:hover, &[data-hover="true"]` → border `--amber`, "+" fill `--amber`, glyph becomes canvas-colored, `filter: drop-shadow(0 0 4px rgba(212,128,58,0.15))`
- `:focus-visible` on "+" → `outline: 2px solid var(--amber-bright); outline-offset: 2px`

**Acceptance:**

- Unit test: renders name, description, `$48`, `· 25 min`, `NIGIRI` label
- Clicking "+" emits `addToCart` once
- Snapshot: default state at 1:1 pixels matches reference mockup
- Keyboard Tab lands focus ring on "+" button

### Phase 4 — Homepage composition

**Files:**

- `apps/web/src/app/pages/home/home.component.ts` — **replace entirely**
- `apps/web/src/app/pages/home/home.component.css` — new
- `apps/web/src/app/app.routes.ts` — route `/` to home **outside** the `AppLayoutComponent` wrapper
- `apps/web/src/app/features/home/home.service.ts` (optional) — thin wrapper over `MenuService` for the 6-item list

**Route structure (app.routes.ts):**

```ts
// existing: all routes nested under AppLayoutComponent
// proposed: split into two route groups
[
  { path: '', component: HomeComponent },                 // no layout
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: 'menu', … },
      { path: 'cart', … },
      // etc.
    ]
  }
]
```

**Home component template structure:**

```html
<main class="canvas" aria-label="Oishi Sushi home">
  <header class="band band--header">
    <div class="wordmark">OISHI <span class="diamond"></span> SUSHI</div>
    <nav class="nav">…</nav>
    <div class="cart">…</div>
  </header>
  <section class="band band--menu">
    <span class="section-meta">— TODAY'S SELECTION</span>
    <div class="grid">
      @for (meal of meals(); track meal.id; let i = $index) {
      <app-menu-card … [attr.data-hover]="i === 1 ? 'true' : null" />
      }
    </div>
  </section>
  <section class="band band--sommelier">
    <app-sommelier-input />
  </section>
</main>
```

Note: The mockup locks Card 2 into hover. In production, that lock is removed — the hover CSS pseudo-class handles it naturally. Keep the `data-hover` override behind a dev-only flag if we want to preserve the mockup parity during review.

**Acceptance:**

- Visiting `/` at 1440×900 renders without scrollbars
- Wordmark "OISHI" at x=40, baseline y≈35 (dev-tools inspection)
- 6 cards in a 3×2 grid
- Section meta "— TODAY'S SELECTION" in amber at x=40, y=96
- Card 2 appears in hover state on first load (dev parity) — remove before shipping, see §8.2

### Phase 5 — Cart integration

**Files to modify:**

- `apps/web/src/app/pages/home/home.component.ts` — inject `CartStore`; derive `cartCount = computed(() => this.cart.items().length)`, `cartTotal = computed(…)`, `cartEta = signal(40)` (constant for V1)
- MenuCard `(addToCart)` emission → `cart.add(mealId)` handler

**Badge behavior:**

- Default visible as amber circle with digit
- When count === 0: render the bag icon without the badge (or show `0` dimmed — spec shows 3 always; confirm during Phase 5)

**Meta line:**

- Template: `Your order: {{ cartCount() }} items · ${{ cartTotal() }} · delivery in {{ cartEta() }} min`
- Empty-cart fallback: `Your cart is empty`

**Acceptance:**

- Clicking "+" on Otoro (card 1): cart count → 1, badge renders `1`, meta updates to `1 item · $48 · delivery in 40 min` (singular handled)
- Cart store already persists to localStorage → reload preserves state

### Phase 6 — Sommelier UI stub

**Files to add:**

- `apps/web/src/app/features/home/components/sommelier-input/sommelier-input.component.ts`
- `apps/web/src/app/features/home/components/sommelier-input/sommelier-input.component.css`
- `apps/web/src/app/features/home/components/sommelier-input/sommelier-input.component.spec.ts`

**Template:**

```html
<div class="sommelier">
  <div class="intro">
    <span class="label">— SOMMELIER AI</span>
    <span class="tagline"
      >Ask what's freshest tonight, what pairs with sake, what to try
      first.</span
    >
  </div>
  <form class="input-row" (ngSubmit)="onSubmit()">
    <label for="kenji" class="sr-only">Ask the sommelier</label>
    <span class="diamond" aria-hidden="true"></span>
    <input
      id="kenji"
      type="text"
      [formControl]="query"
      placeholder="Ask Kenji — what's freshest, what pairs with sake, what should I try first…"
    />
    <button type="submit" class="send" [disabled]="loading()" aria-label="Send">
      @if (loading()) { <span class="ellipsis">…</span> } @else {
      <lucide-icon name="arrow-up" /> }
    </button>
  </form>
  <div class="meta">…</div>
</div>
```

**V1 behavior:**

- `onSubmit()` logs `console.info('[sommelier] stub:', query.value)`, sets `loading=true` for 1.5s, resets form
- Future: swap in `sommelierService.ask(query)` with real HTTP

**Acceptance:**

- Input renders at the spec coordinates (x=40→1400, y=825→875)
- Placeholder matches spec verbatim (apostrophes preserved)
- Focus transitions border hairline → amber in 150ms
- Send button shows ArrowUp from Lucide, amber fill
- sr-only label present, `aria-label` on send button

### Phase 7 — A11y & below-1200 notice

**Files to modify:**

- `apps/web/src/app/pages/home/home.component.ts` — render a below-1200px notice using `@if (viewportWidth() < 1200) { <desktop-only-notice /> }`
- A new `DesktopOnlyNoticeComponent` (6-line template saying "Oishi Sushi is desktop-only for now. Please switch to a desktop browser.")

**A11y audit checklist:**

- Focus rings visible on: nav links, cart button, all 6 "+" buttons, sommelier input, send button
- Nav items are `<a>` with `href` — even if routing is stubbed
- Cart button is `<button>` with `aria-label="Open cart (N items)"`
- Section meta: amber on `--card-lifted` ≈ 4.8:1 → passes AA for 18px+ text; for 10px section meta, swap to `--amber-bright` if axe flags
- Keyboard: Tab order is sensible (nav → cart → each card's "+" → input → send)

**Acceptance:**

- `pnpm nx run web:lint` green
- axe / Lighthouse audit at 1440×900: no critical issues
- At 1199px width, notice renders instead of the canvas

### Phase 8 — Acceptance verification (Playwright + CUJ)

**Files to add/modify:**

- `acceptance/cujs.md` — add `CUJ-1 Home` block:
  - Navigate to `/` at viewport 1440×900
  - Assert no horizontal or vertical scrollbars
  - Assert 6 meal cards render with names matching seed
  - Assert cart badge shows current cart count
  - Assert sommelier input is focusable and has correct placeholder
  - Assert Lighthouse a11y score ≥ 95
- `apps/web-e2e/src/home.spec.ts` (new) — Playwright test covering the above

**Phase gate:** This must pass before the plan is considered shipped. Per CLAUDE.md §10 (Acceptance Verification), unit-green alone is not sufficient for phase advancement.

## 6. Commit breakdown

One commit per phase, small and reviewable:

| #   | Commit message                                      | Files touched                     |
| --- | --------------------------------------------------- | --------------------------------- |
| 1   | `feat(home): foundation — tokens, fonts, lucide`    | 5                                 |
| 2   | `feat(data): realign seed + assets to spec meals`   | ~10 (seed + 6 spec files + tests) |
| 3   | `feat(home): MenuCard primitive with spec states`   | 3                                 |
| 4   | `feat(home): three-band homepage composition`       | 4                                 |
| 5   | `feat(home): wire cart store to badge + meta line`  | 1                                 |
| 6   | `feat(home): sommelier input UI stub`               | 3                                 |
| 7   | `feat(home): a11y + below-1200 desktop-only notice` | 2                                 |
| 8   | `test(home): playwright acceptance for 1440×900`    | 2                                 |

Total: ~30 files touched.

## 7. Risks & unknowns

### 7.1 Test fixture breakage (known)

6 files reference the existing meal names:

- `apps/web/src/app/features/checkout/checkout.component.spec.ts`
- `apps/web/src/app/features/cart/cart.store.spec.ts`
- `apps/web/src/app/pages/admin/meal-editor.component.spec.ts`
- `apps/web/src/app/pages/admin/admin-meals.component.spec.ts`
- `apps/web/src/app/pages/menu/menu.component.spec.ts`
- `apps/web/src/app/pages/menu/meal-card-details.component.spec.ts`

**Mitigation:** Phase 2 is a single commit that updates the seed AND all test fixtures together. Test-first: update assertions, confirm tests fail with current seed, then flip the seed. Verify all tests green before commit.

### 7.2 Real photography absent

**Mitigation:** Phase 4 renders solid `--photo-{fill}` blocks per §4.4. The `MenuCard.imageSrc` input is in place so a follow-up PR adds `<img>` without structural change.

### 7.3 Sommelier endpoint scope

**Open question:** UI stub only (V1, what this plan assumes), or scaffold `POST /api/sommelier` returning a canned response in NestJS?

**Recommendation:** UI stub only. Add the backend in a follow-up once RAG infrastructure is chosen (Pinecone? pgvector? LangChain?). The UI's submit handler is written so swapping to a real HTTP call is a 3-line change.

### 7.4 Homepage route split may confuse existing deep links

The current `/` loads inside `AppLayoutComponent`. After Phase 4, `/` bypasses it. Deep links to `/menu`, `/cart`, etc. are unchanged.

**Mitigation:** E2E test for the route split. If users navigate from home → menu via the "MENU" nav link, the transition should work (and it will — the nav link is a simple `routerLink="/menu"`).

### 7.5 Desktop-only is aggressive

Spec says below 1200px shows a desktop-only notice. Mobile users get nothing. This is a product call carried over from the spec; flag it if this changes before Phase 7.

### 7.6 Mockup lock on Card 2 hover

The spec mockup locks Card 2 into the hover state to document the interaction. Production should NOT lock a card. Phase 4 includes a `data-hover` attribute for mockup parity during review; remove it in Phase 4's final commit or in Phase 7. **Explicitly track this** — it's the kind of thing that ships accidentally.

## 8. Open questions (need user input before starting)

1. **Sommelier backend:** UI stub only for V1 (my recommendation), or scaffold a NestJS module?
2. **Image strategy:** Solid-color fallbacks for V1 (my recommendation), or pause to commission/source photography?
3. **Seed migration:** Reset DB (destructive, clean) or write a `prisma/migrations/*-realign-meals.sql` that swaps rows? App is pre-launch → reset is simpler.
4. **Desktop-only enforcement:** Confirm the spec's below-1200 behavior is still the product call.
5. **Admin panel:** Existing admin routes let users edit meal names freely. Does the admin keep that freedom, or should the 6 spec meals be treated as fixtures (read-only)?
6. **Card 2 hover lock:** Keep the mockup parity lock during Phase 4 review then remove, or start with no lock?

## 9. Estimated effort

| Phase | Effort                            | Dependencies                 |
| ----- | --------------------------------- | ---------------------------- |
| 1     | 30 min                            | —                            |
| 2     | 1 h (mostly test fixture updates) | Phase 1                      |
| 3     | 1.5 h                             | Phase 1                      |
| 4     | 2 h                               | Phase 1, 3                   |
| 5     | 30 min                            | Phase 4 + existing CartStore |
| 6     | 1 h                               | Phase 1                      |
| 7     | 45 min                            | Phase 4                      |
| 8     | 1 h                               | All                          |

**Total:** ~8 hours of focused work.

## 10. Non-goals (explicit)

- No change to `/menu`, `/cart`, `/checkout`, `/tracking`, `/admin` styling
- No backend RAG work
- No real photography
- No mobile / responsive treatment
- No dark-theme rollout beyond home
- No admin-panel feature additions
