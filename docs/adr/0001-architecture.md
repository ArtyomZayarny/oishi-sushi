# ADR-0001: High-level architecture — modular monolith + SSR SPA + Socket.IO gateway

## Status

`Accepted`

## Date

2026-04-23

## Context

`oishi-sushi` is a single-team (solo) portfolio app with a small, well-defined domain (users, menu, orders). It must demonstrate senior-level Angular patterns (Signals, SSR, `@defer`, SignalStore, WebSockets) while keeping operational cost near zero and deploy surface small. The stack is constrained to TypeScript top-to-bottom so the portfolio reads as one coherent system, not four glued-together frameworks.

Playbook reference: `docs/_playbook/01-architecture.md` ("enterprise SPA with realtime → modular monolith + gateway" decision tree).

## Options considered

### Option A — Modular monolith (NestJS) + Angular SSR + Socket.IO gateway in the same process

- **Pros:** one deploy, one log stream, shared TS models via Nx lib, in-process event emission between HTTP and WS layers, zero network hop for realtime fan-out, simplest possible local-dev story (one `docker compose up`).
- **Cons:** scaling the WS connection count drags the HTTP pool with it; a WS memory leak takes down HTTP too.
- **Cost / effort:** 1× deploy, 1× CI pipeline.
- **Reversibility:** high — extracting the gateway into its own Nest app is ~1 day of work if traffic ever demands it.

### Option B — Microservices (separate auth, menu, orders, gateway services)

- **Pros:** independent scaling, blast-radius isolation, forces interface discipline.
- **Cons:** massive overkill for one developer and a demo. Needs a message bus, service discovery, distributed tracing just to not be worse than option A on day 1. Undermines the "senior Angular portfolio" story — recruiters skim the backend; they want the frontend to shine.
- **Cost / effort:** 3× deploys, 3× CI pipelines, introduces a broker.
- **Reversibility:** low — decomposing is easy; recomposing is not.

### Option C — Serverless functions (Vercel/Cloudflare) + managed Postgres + managed WS (Ably / Pusher)

- **Pros:** zero ops, generous free tier.
- **Cons:** WebSockets on edge functions are still awkward; JWT-cookie auth on split origins needs CORS gymnastics; Prisma on serverless has cold-start + connection-pool pain; externalizing realtime to Ably hides the NestJS WebSocket gateway code I want to showcase.
- **Cost / effort:** low $ but high plumbing.
- **Reversibility:** medium — vendor lock on the realtime layer is the biggest exit tax.

## Decision

Modular monolith (Option A): one NestJS app exposes HTTP routes and the Socket.IO gateway; one Angular SSR app serves `/menu` rendered server-side and hydrates to a zoneless SPA. Rationale: **minimal moving parts + maximum surface area for the Angular features I actually want to demo**.

## Consequences

### Positive

- One `docker compose up` boots the whole system.
- Shared DTOs live in `libs/shared-types` and compile-time prevent contract drift between api and web.
- Order status changes publish in-process from `OrdersService` to `OrdersGateway` — no bus, no race.
- CI pipeline has exactly 3 targets: `nx affected lint test build`, `nx e2e web-e2e`.

### Negative / trade-offs we accept

- If the demo ever went viral (it won't), WS fan-out would saturate the Node event loop before HTTP did.
- No per-bounded-context deploy cadence — everything ships together.
- A crash in the gateway kills the HTTP surface. Mitigated by health checks + Docker restart, not by process isolation.

### What this decision forces us to do

- [x] Nx workspace with `apps/{web,api,web-e2e}` + `libs/{shared-types,ui-kit}` (phase 00-scaffold, already done).
- [x] Keep all cross-concern contracts in `libs/shared-types` — never re-declare a DTO in a controller (enforced in phase 06).
- [x] Emit order-status events through a typed `OrderStatusEvent` — no stringly-typed payloads crossing the HTTP↔WS boundary.

## Revisit trigger

- Revisit if concurrent WS connections exceed ~5k on one node, or if two teams/developers need to ship independently to different bounded contexts.

## Links

- Related ADRs: 0002 (backend), 0003 (database), 0004 (frontend), 0006 (devops)
- PRD section: "Core loop", "Success metrics"
- Playbook ref: `docs/_playbook/01-architecture.md`
