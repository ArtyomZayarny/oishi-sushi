# 1-Page PRD — `oishi-sushi`

> Sushi ordering web app with an admin panel. This PRD is invented — the project is a senior-level Angular portfolio piece, not a funded product. Metrics below are aspirational targets chosen to stress-test the architecture, not commitments.

## Problem

Urban office workers lose 10–15 minutes every weekday choosing and ordering lunch. Most sushi delivery apps bury the menu under carousels of ads and upsell modals, force a login before showing prices, and give no visibility into the order after checkout. The result: ordering sushi feels like an errand, not a two-tap ritual.

## Target user (one persona, not "everyone")

- **Who they are (role, context):** Office worker, 25–40, downtown, orders lunch 1–3×/week, laptop-first, eats at desk or in a small team room.
- **Their current workaround:** Glovo / Bolt Food / Uber Eats generalist apps, or phoning the sushi place directly.
- **Where they feel the pain (frequency, severity 1–5):** 3×/week; severity 3 — slow, not broken, but corrosive over a year.
- **Where to reach them for interviews:** Slack communities for local tech workers, LinkedIn DMs to ops/engineering roles at 50+ person companies, in-person outside a concrete office tower at 12:15pm.

## Value proposition

For office workers who waste 15 minutes a day on lunch decisions, **oishi-sushi** is a fast sushi ordering app that shows the menu first, checks out in under 60 seconds, and live-tracks the order from "pending" to "delivered" — unlike generalist delivery apps that bury the menu and go dark after payment.

## Core loop (the smallest valuable experience)

1. User lands on `/menu` (SSR, no login required) and sees categories → adds 2 rolls + 1 nigiri to cart via a single tap each.
2. System persists the cart to `localStorage` (SignalStore), lets the user jump to checkout, validates a complex Reactive Form, and creates the order in a Prisma transaction.
3. User gets redirected to `/orders/:id` where a status badge updates live via Socket.IO as the admin progresses the order through `PENDING → CONFIRMED → PREPARING → READY → DELIVERED` — and comes back because the full loop took under a minute.

## In scope (MVP)

- [x] Public SSR menu with categories, `@defer` meal cards, allergen badges
- [x] Customer auth (register / login / me) with httpOnly cookie JWT
- [x] Cart (SignalStore) with localStorage persistence + derived totals
- [x] Checkout with nested Reactive Form (customer, delivery, payment tip, per-item notes FormArray) + cross-field validators
- [x] Order creation in a DB transaction (order + items atomic)
- [x] Live order status via Socket.IO with per-user room
- [x] Admin panel: meal CRUD (FormArray for options, allergen multiselect), order list, status patch
- [x] Role-based route guards (customer vs admin)
- [x] Seeded demo data (admin + customer users, 3 categories, 6 meals)

## Out of scope (explicitly)

- [ ] Real payment integration (Stripe, Apple Pay, etc.) — order total is stored, not charged
- [ ] File upload for meal images — URL field only
- [ ] OAuth / social login / MFA — email+password only
- [ ] Mobile app, PWA install prompt, push notifications
- [ ] i18n / localization
- [ ] Email / SMS notifications
- [ ] User reviews, ratings, favorites
- [ ] Multi-tenant / multi-restaurant
- [ ] Production deployment (demo runs locally via Docker Compose)

## Success metrics (30 / 90 days)

> Portfolio project — metrics are invented targets to anchor architectural tradeoffs, not commitments.

| Metric                                     | Day 30 | Day 90 | Source                       |
| ------------------------------------------ | ------ | ------ | ---------------------------- |
| Seeded demo plays per week                 | 10     | 30     | analytics on demo.oishi.dev  |
| Core-loop completion (menu → order placed) | 60%    | 70%    | funnel on session events     |
| D30 repeat-order rate                      | 15%    | 25%    | `orders` grouped by `userId` |
| p95 menu TTFB (SSR)                        | <600ms | <400ms | server timing header         |
| p95 order-status push latency              | <500ms | <300ms | gateway emit → client recv   |

## Kill criteria

- If by **2026-07-31** the D30 repeat-order rate is below **20%**, the "speed-first" thesis is wrong — stop investing in checkout polish, pivot the portfolio to focus on the realtime/admin story instead.
- If Lighthouse Performance on `/menu` drops below **85** after any phase, pause feature work and profile until it's back above 90 — SSR + `@defer` is the headline capability.

## Risks & unknowns

- [ ] **Biggest unknown:** does a faster checkout actually change reorder behavior, or is "my usual place" stickier than UX? Would need live A/B test to know.
- [ ] **Biggest technical risk:** Socket.IO reconnection + auth handshake is fiddly in SSR + httpOnly-cookie world; covered by phase 11 tests.
- [ ] **Biggest adoption risk:** no delivery fleet — the "delivered" status is simulated. Real users would demand a courier map.

## Discovery evidence

<!-- Portfolio project — no real interviews. Left blank deliberately, not forgotten. -->

- Interview 1: _not conducted (portfolio piece)_
- Interview 2: _not conducted (portfolio piece)_
- Interview 3: _not conducted (portfolio piece)_
- Interview 4: _not conducted (portfolio piece)_
- Interview 5: _not conducted (portfolio piece)_

---

**Status:** Building
**Last updated:** 2026-04-23
**Owner:** ArtyomZayarny (solo, portfolio)
