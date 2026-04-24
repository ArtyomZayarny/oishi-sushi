# Oishi Sushi — Homepage Design Specification

> Source of truth for implementation. Every measurement, color, weight, and state is explicit. Pair this document with `Oishi Sushi.html` (the SVG mockup) for visual reference.

---

## 1. Project overview

**Oishi Sushi** is a premium sushi delivery service with an AI sommelier (a RAG-backed chat agent named **Kenji**). The homepage is a **single-viewport desktop page** — no scroll — engineered at **1440 × 900** (16:9-ish).

**Design direction:** editorial, restrained-luxury, dark-precision. Think fine-dining-website discipline. The food is the hero; there is **no hero image, no marketing headline**. The 3×2 menu grid does 100% of the selling.

**Non-goals:**

- No Japanese-themed iconography (no kanji/kana, cherry blossoms, torii gates, enso, bamboo, waves, fake brushstrokes).
- No AI-slop tropes (no purple gradients, no emoji, no soft/drop shadows, no decorative illustrations).
- No scroll, no carousel, no modals on the first render.

---

## 2. Canvas & overall structure

- **Viewport:** 1440 × 900, fixed. Desktop only.
- **Background:** `#0A0A0A` (deep charcoal — never pure black).
- **Outer border:** 1px solid `#1F1D1A`, inset 0.5px on the canvas edge.
- **Three horizontal bands:**

| Band         | Y-range   | Height | Purpose                           |
| ------------ | --------- | ------ | --------------------------------- |
| 1. Header    | 0 → 56    | 56px   | Wordmark, nav, cart               |
| 2. Menu grid | 56 → 780  | 724px  | 3×2 menu cards (the hero content) |
| 3. AI chat   | 780 → 900 | 120px  | Sommelier input + meta line       |

Bands 1 and 3 are separated from band 2 by 1px hairlines in `#2A2723`.

---

## 3. Design tokens

### 3.1 Color

All hex values are exact — **no substitutions, no Tailwind-named equivalents**.

```css
:root {
  /* Surfaces */
  --canvas: #0a0a0a; /* page background */
  --card-lifted: #14110d; /* card fill, input fill */
  --outer-border: #1f1d1a; /* 1px canvas border */
  --hairline: #2a2723; /* dividers, card borders, input border */

  /* Text */
  --text-primary: #f5f1ea; /* warm off-white — never #FFF */
  --text-secondary: #8a8279; /* muted warm gray */

  /* Accent — use SPARINGLY, ~6 moments max per screen */
  --amber: #d4803a; /* primary accent */
  --amber-bright: #e89550; /* reserved for future hover/pressed */

  /* "Photo" fills (solid color stands in for photography in the mockup;
     replace with real <img> in production, but keep these as fallbacks) */
  --photo-umber: #3d2f1f;
  --photo-sepia: #4a3a28;
  --photo-stone: #2e2820;
}
```

**Amber budget:** amber appears on (a) the wordmark diamond, (b) the cart badge, (c) the "— TODAY'S SELECTION" label, (d) Card 2's border + glow + filled "+", (e) the six per-card 24×1 underlines + prices (part of card system), (f) the sommelier label + input diamond + send button. If a redesign adds any more amber, something must be removed — amber is scarce on purpose.

### 3.2 Typography

Two families only. Google Fonts:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Inter:wght@400;500;600&display=swap"
  rel="stylesheet"
/>
```

**Fraunces** — display serif. Only weights used: **300** (thin meal names) and **500** (wordmark, prices).
**Inter** — body / UI sans. Only weights used: **400** (descriptions, meta, placeholder) and **500** (uppercase labels, nav); **600** only on the cart badge digit.

| Role                   | Family   | Size | Weight     | Tracking         | Transform | Color                     |
| ---------------------- | -------- | ---- | ---------- | ---------------- | --------- | ------------------------- |
| Wordmark "OISHI"       | Fraunces | 20   | 500        | 3                | —         | `--text-primary`          |
| Wordmark "SUSHI"       | Inter    | 10   | 500        | 2                | uppercase | `--text-secondary`        |
| Nav items              | Inter    | 11   | 500        | 1.6              | uppercase | `--text-primary`          |
| Cart badge digit       | Inter    | 10   | 600        | 0                | —         | `--canvas`                |
| Section meta           | Inter    | 10   | 500        | 1.8              | uppercase | `--amber`                 |
| Card category label    | Inter    | 9    | 500        | 1.5              | uppercase | `--text-secondary` @ 0.7α |
| Meal name              | Fraunces | 22   | 300        | -0.2 (tight)     | —         | `--text-primary`          |
| Description            | Inter    | 12   | 400        | 0                | —         | `--text-secondary`        |
| Price                  | Fraunces | 18   | 500        | 0 (tabular-nums) | —         | `--amber`                 |
| Time meta ("· 25 min") | Inter    | 10   | 400        | 0                | —         | `--text-secondary`        |
| Sommelier intro italic | Inter    | 11   | 400 italic | 0                | —         | `--text-secondary`        |
| Input placeholder      | Inter    | 14   | 400 italic | 0                | —         | `--text-secondary`        |
| Bottom meta            | Inter    | 10   | 400        | 0                | —         | `--text-secondary`        |

**Prices MUST use `font-variant-numeric: tabular-nums;`** so columns align across cards.
**Serif tracking** stays tight by default. **All uppercase labels** use expansive letter-spacing (1.5–3) — the weight increase to 500 compensates.

### 3.3 Geometry

- **Corner radius:** `2px` everywhere. Cards, input, send button, "+" button. **No other radius value appears anywhere.**
- **Stroke weights:** 1px for borders/hairlines, 1.25 for the cart bag icon, 1.5 for the "+" glyph and the send arrow.
- **Shadows / glows:** none, except the single 4px amber glow on Card 2 hover (see §5.3).
- **Gradients:** banned everywhere except that same amber glow.

---

## 4. Band 1 — Header (0 → 56)

A 56px-tall, quiet row. Bottom bounded by a 1px `--hairline` at y=55.

### 4.1 Left cluster — wordmark (starts x=40, vertically centered)

Three elements on one baseline, reading left-to-right with 8px gaps:

1. **"OISHI"** — Fraunces 20/500, letter-spacing 3, `--text-primary`. Baseline at y≈35.
2. **Amber diamond** — a 6×6 square rotated 45°, filled `--amber`. Centered vertically on the wordmark baseline cap-height (y≈28 for the center point).
3. **"SUSHI"** — Inter 10/500 uppercase, letter-spacing 2, `--text-secondary`. Baseline y≈32.

### 4.2 Nav cluster — right-anchored

Three uppercase links: **MENU · STORY · DELIVERY** (left-to-right).
Style: Inter 11/500, letter-spacing 1.6, `--text-primary`.
**Spacing rule:** 48px gaps between **word edges**, not anchor points. Right edge of DELIVERY sits at x=1220.

Default state: `--text-primary`.
Hover (add in code): color stays; a 1px amber underline appears 4px below the baseline. Cursor pointer.

### 4.3 Far-right cluster — cart (ends x=1400)

Two elements, 10px gap between them:

1. **Bag icon** — Lucide `ShoppingBag`, 16×16, 1.25 stroke, `--text-primary`, no fill. Top-left at (1358, 20).
2. **Cart badge** — 16×16 amber circle (`cx=1392, cy=28, r=8`), fill `--amber`. Inside: the digit **3** centered, Inter 10/600, fill `--canvas`.

Click target: entire 16×16 badge + bag area. Action: open cart drawer (not part of this mockup; implement as a stubbed click handler).

---

## 5. Band 2 — Menu grid (56 → 780) — THE HERO

### 5.1 Section meta

- Position: x=40, y=96 (baseline).
- Text: `— TODAY'S SELECTION` (em-dash + space prefix, uppercase).
- Style: Inter 10/500, letter-spacing 1.8, `--amber`.

### 5.2 Grid layout

**3 columns × 2 rows** of 440×300 cards. 20px gap on both axes.

|                   | Col 1 | Col 2 | Col 3 |
| ----------------- | ----- | ----- | ----- |
| **Row 1** (y=120) | x=40  | x=500 | x=960 |
| **Row 2** (y=440) | x=40  | x=500 | x=960 |

Math check: 3 × 440 + 2 × 20 = 1360 = 1400 − 40 ✓. Row 2 bottom: 440 + 300 = 740, leaving 40px breathing room before the AI band at y=780 ✓.

### 5.3 Card anatomy (440×300)

Each card is a horizontal composition: **image zone left (200×300)** + **content zone right (240×300)**.

```
┌──────────────┬────────────────────────┐
│              │                        │
│              │  [NIGIRI]              │
│   solid      │                        │
│   color      │  Otoro Selection       │  ← Fraunces 22/300
│   "image"    │  ──                    │  ← 24×1 amber hairline
│   200×300    │                        │
│              │  Five-day aged bluefin │  ← Inter 12/400
│              │  belly, hand-cut       │     2 lines max
│              │  nigiri, eight pieces. │
│              │                        │
│              │  $48              [+]  │  ← price / button row
│              │  · 25 min              │
└──────────────┴────────────────────────┘
```

**Card container (default state):**

- Fill: `--card-lifted`
- Border: 1px `--hairline`
- Radius: 2px

**Image zone (200×300):**

- A solid-color block whose hex rotates across the six cards (see §5.5). **In the mockup this block IS the image** — do not substitute a gradient, illustration, or placeholder pattern. In production this is where the real photograph renders; the solid color becomes the loading/fallback state.
- Top-left inset label, 16px from top and left: category tag (e.g. `NIGIRI`) in Inter 9/500 uppercase, letter-spacing 1.5, `--text-secondary` at 0.7 opacity.

**Content zone (offset x=224 from card origin, width 240):**

| Y-offset (from card top) | Element                                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64 (baseline)            | **Meal name** — Fraunces 22/300, `--text-primary`, tight leading, tracking -0.2                                                                                                                                                                                                     |
| 84–85                    | **24×1 amber underline** — `--amber` fill, 24px wide, 1px tall                                                                                                                                                                                                                      |
| 114 / 132                | **Description** — Inter 12/400, `--text-secondary`, two lines, 18px line-height, max-width ~200px                                                                                                                                                                                   |
| 264 (baseline)           | **Price** — Fraunces 18/500, `--amber`, tabular-nums                                                                                                                                                                                                                                |
| 248 (top-left of 32×32)  | **"+" button** — right-aligned within content zone (local x=400 from card origin, i.e. flush with card right edge minus 8px). 32×32, 2px radius, 1px `--amber` border, transparent fill, "+" glyph drawn with two 1.5px amber strokes (a horizontal + vertical 12px line centered). |
| 288 (baseline)           | **Time meta** — `· 25 min`, Inter 10/400, `--text-secondary`                                                                                                                                                                                                                        |

### 5.4 Card states

**Default** (5 of 6 cards in the mockup):

- Border: 1px `--hairline`
- "+" button: transparent fill, 1px amber border, amber glyph
- No glow

**Hover** (Card 2 is locked into this state in the mockup):

- Border upgraded: 1px `--amber` (replaces hairline)
- "+" button: fill `--amber`, glyph becomes 1.5px `--canvas` strokes
- **4px amber glow at 15% opacity** around the card. Implement with a filter: `drop-shadow(0 0 4px rgba(212, 128, 58, 0.15))`, or in SVG via `<filter><feGaussianBlur stdDeviation="4" /></filter>` on a behind-card amber rect at 15% α. **This is the ONE blur/gradient permitted in the entire page.**
- No movement, no scale — the glow + border + filled button is the whole hover vocabulary.

**Clicked / add-to-cart:** add a brief (150ms) border-flash to `--amber-bright` and increment the cart badge digit. Optional polish, not required for v1.

**Focus-visible (keyboard):** 2px outline at `--amber-bright` with 2px offset (accessibility — must be present).

### 5.5 The six meals

Photo-fill rotation: **umber → sepia → stone → umber → sepia → stone**.

| #   | Label   | Name              | Description                                                          | Price | Fill  | State     |
| --- | ------- | ----------------- | -------------------------------------------------------------------- | ----- | ----- | --------- |
| 1   | NIGIRI  | Otoro Selection   | Five-day aged bluefin belly, hand-cut nigiri, eight pieces.          | $48   | umber | default   |
| 2   | OMAKASE | Chef's Omakase    | Twelve pieces chosen by our chef each morning, cold-chain delivery.  | $95   | sepia | **HOVER** |
| 3   | MAKI    | Toro Truffle Roll | Fatty tuna, shaved black truffle, micro shiso, gold leaf.            | $38   | stone | default   |
| 4   | SASHIMI | Sashimi Moriawase | Seven cuts of the morning's best — hamachi, uni, kanpachi, and more. | $72   | umber | default   |
| 5   | DONBURI | Ikura Don         | Salmon roe cured in soy and sake over warm vinegared rice.           | $32   | sepia | default   |
| 6   | SETS    | Couple's Set      | Twenty pieces for two, balanced across nigiri, maki, and sashimi.    | $128  | stone | default   |

All meal names use typographic apostrophes (`'`) and em-dashes (`—`) where shown. Do not substitute straight quotes.

In production, only one card is in hover state at a time — the one the user's cursor is over. The mockup locks Card 2 into hover purely to document the interaction vocabulary.

---

## 6. Band 3 — AI chat input (780 → 900)

Top bounded by a 1px `--hairline` at y=780. Same `--canvas` background as the rest of the page.

### 6.1 Intro row (y≈800–804 baseline)

Two text elements on the same baseline:

- x=40: **`— SOMMELIER AI`** — Inter 10/500 uppercase, letter-spacing 1.8, `--amber`.
- x=180: **`Ask what's freshest tonight, what pairs with sake, what to try first.`** — Inter 11/400 italic, `--text-secondary`.

### 6.2 Input field (x=40→1400, y=825→875, height=50)

- 2px radius rectangle. Fill `--card-lifted`, 1px `--hairline` border.
- **Left interior (x=60, v-center y=850):**
  - Small **amber diamond** — ~5.66 × 5.66 square rotated 45° (reads as a ~4×4 diamond), fill `--amber`.
  - 14px gap.
  - Placeholder text: **`Ask Kenji — what's freshest, what pairs with sake, what should I try first…`** — Inter 14/400 italic, `--text-secondary`. (Starts around x=78.)
- **Right interior (send button, right edge x=1360, v-center y=850):**
  - 40×32 rectangle, 2px radius, fill `--amber`.
  - Centered inside: **Lucide `ArrowUp`** icon, 16×16, 1.5 stroke, `--text-primary` (warm off-white, not pure white).
  - Top-left of button at (1320, 834).

**Input behavior (for Claude Code to wire up):**

- On focus: border transitions `--hairline` → `--amber` in 150ms. Placeholder fades.
- On typing: text color `--text-primary`, weight 400, style normal (not italic — italic is placeholder-only).
- On submit (Enter or send button click): POST to the sommelier/RAG endpoint. While loading, show a 3-dot amber ellipsis in place of the arrow glyph. Response rendering surface is TBD — not part of this mockup.

### 6.3 Meta line (y≈885–893 baseline)

- Left (x=40): **`Your order: 2 items · $86 · delivery in 40 min`** — Inter 10/400, `--text-secondary`. Dynamic — computed from cart state.
- Right (x=1400, right-aligned): **`Powered by Oishi AI`** — Inter 10/400, `--text-secondary`. Static.

---

## 7. Iconography

Use **Lucide** (or lucide-react) for all icons. No custom SVGs.

| Icon | Lucide name   | Size  | Stroke | Color            |
| ---- | ------------- | ----- | ------ | ---------------- |
| Cart | `ShoppingBag` | 16×16 | 1.25   | `--text-primary` |
| Send | `ArrowUp`     | 16×16 | 1.5    | `--text-primary` |

The "+" on cards is **not a Lucide icon** — it's two 1.5px strokes drawn inside a 32×32 2px-radius container, for precise alignment with the amber system.

The two **diamonds** (wordmark, input) are rotated squares, not icons. Keep them hand-drawn primitives.

---

## 8. Implementation notes

### 8.1 Structural recommendations

- One `<main>` for the whole page, three direct children for the three bands (`<header>`, `<section class="menu">`, `<section class="sommelier">`).
- The menu grid is best expressed as CSS Grid: `grid-template-columns: repeat(3, 440px); gap: 20px;`. Use `justify-content: center` or explicit left-padding to land the first card at x=40.
- Each card is a single component (`<MenuCard>`) receiving `{ label, name, description, price, timeMin, photoFill, imageSrc?, hover? }`.
- The whole page is fixed 1440×900 — no responsive work in v1. Center it in the viewport with black letterboxing if the viewport is larger; render a "Desktop only" message below 1200px wide.

### 8.2 Accessibility

- All interactive elements need visible focus rings (§5.4).
- Nav and cart are `<button>` or `<a>` elements, not `<div>`s with onclick.
- The sommelier input needs a proper `<label>` (visually hidden via `sr-only`).
- Amber on `--card-lifted` has ~4.8:1 contrast — passes AA for 18px+ text (the price). For the 10px section meta, bump to `--amber-bright` if any automated audit flags it; visually it's fine.
- Do not rely on color alone to signal the hover state — the border weight change does the heavy lifting for users who can't perceive the glow.

### 8.3 What's mocked vs. real

| Element                       | Mock in SVG                     | Real in production                                                      |
| ----------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Card image                    | Solid color block               | `<img>` with object-fit: cover; solid color is loading fallback         |
| Cart badge "3"                | Hardcoded                       | Derived from cart store                                                 |
| Meta "2 items · $86 · 40 min" | Hardcoded                       | Derived from cart store + delivery ETA                                  |
| "— SOMMELIER AI" chat         | Input only, no response surface | Full RAG chat: input → streaming response panel (design TBD, not in v1) |
| Nav links                     | Non-functional                  | Route to /menu, /story, /delivery                                       |
| "+" button                    | Visual only                     | Adds meal to cart, increments badge, fires analytics event              |

### 8.4 Don't-do list (carried over from the brief)

- No corner radius other than 2px.
- No font weights other than the ones listed in §3.2 — do not default anything to 400/600 out of habit.
- No gradients, shadows, or glows except the single Card 2 amber glow.
- No purple, no terracotta-on-cream, no pure `#000` or `#FFF`.
- No emoji, no Japanese-themed stock imagery, no illustrations.
- No "hero headline" or marketing copy band above the grid.

---

## 9. Asset deliverables for implementation

- `design.md` — this document.
- `Oishi Sushi.html` — SVG mockup, source of truth for positions. Open in a browser to reference exact pixel positions with devtools.
- Replace the six photo-fill blocks with real photography when available. Suggested shot style: overhead or 45°, warm low-key lighting, matte black or dark-wood surface, subject tightly cropped, no garnish chaos. Output: 400×600 (2x of 200×300), JPEG quality 82, ~60KB each.

---

_End of spec. Questions to `design@oishi.example` before deviating from any measurement above._
