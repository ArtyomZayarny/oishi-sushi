# ADR-0002: Backend framework — NestJS

## Status

`Accepted`

## Date

2026-04-23

## Context

The API must serve a public SSR menu, authenticated customer endpoints, admin-only CRUD, and a Socket.IO gateway — all wired to Postgres via Prisma, all typed, all with OpenAPI documentation for the README screenshot. It must feel parallel to the Angular code (DI, decorators, modules) so the portfolio reads as one coherent system.

Playbook reference: `docs/_playbook/02-backend-stack.md` (decision tree: "full-stack TS + opinionated + DI-heavy → NestJS").

## Options considered

### Option A — NestJS

- **Pros:** Decorator-driven DI that mirrors Angular (module/provider/injectable mental model transfers 1:1 for recruiters reviewing both halves); first-class `@nestjs/websockets` with Socket.IO adapter; Swagger module auto-generates OpenAPI from DTOs + decorators; `class-validator` pairs with `ValidationPipe` for no-boilerplate request validation; testing module makes it straightforward to wire a real Prisma client against compose Postgres for integration specs.
- **Cons:** opinionated structure frustrates developers coming from Express; extra abstraction tax vs raw Express; ~400KB heavier bundle (doesn't matter server-side).
- **Cost / effort:** moderate — directory layout dictated, but Nx generator (`@nx/nest:app`) handles it.
- **Reversibility:** medium — controllers/services are framework-shaped, migrating to Fastify + zod + tsyringe would be weeks of work.

### Option B — Express + Zod + hand-rolled DI

- **Pros:** light, flexible, everyone knows it; fewer layers between code and wire.
- **Cons:** every cross-cutting concern (auth guard, role guard, validation pipe, exception filter, WebSocket handshake) re-implemented by hand; no OpenAPI generator that reads DTOs, so docs drift; the portfolio story degrades to "I wrote a router" instead of "I composed a production backend."
- **Cost / effort:** lower boilerplate per file; higher boilerplate across the system.
- **Reversibility:** high — small framework footprint.

### Option C — tRPC + Fastify

- **Pros:** end-to-end typed RPC, no DTO duplication, procedure-based mental model.
- **Cons:** no native story for Socket.IO gateways (realtime would need `@trpc/server/subscriptions` with its own protocol, not the Socket.IO demo recruiters expect); admin panel would be harder to document in OpenAPI because tRPC hides HTTP routes behind JSON procedures; loses the "shared types via Nx lib" talking point because tRPC infers them from the router.
- **Cost / effort:** low scaffolding, high learning-cost for reviewers unfamiliar with tRPC.
- **Reversibility:** medium — tRPC routers are framework-shaped.

## Decision

NestJS. The DI parity with Angular is the dominant tradeoff — the whole portfolio story is "one coherent TypeScript system", and a backend that looks like a mirror of the frontend is worth more than a lighter Express server nobody will read carefully.

## Consequences

### Positive

- Guards / interceptors / pipes map 1:1 to Angular equivalents; README can draw the parallel in one paragraph.
- `@nestjs/swagger` publishes OpenAPI at `/api/docs` automatically for the README screenshot.
- WebSocket gateway (`@WebSocketGateway`) shares the same DI container as HTTP controllers, so `OrdersService` emits events without an out-of-process bus.
- Integration tests use `Test.createTestingModule` with the real PrismaService → close to production wiring.

### Negative / trade-offs we accept

- Fat vendor lock on NestJS conventions; replacing it means rewriting every controller.
- Cold-start time is worse than Express (~1s vs ~200ms), irrelevant for a long-running dev container.
- Nest generates a lot of decorator boilerplate that first-time readers of the repo have to parse.

### What this decision forces us to do

- [x] Every module gets its own folder with controller, service, module, DTOs under `apps/api/src/<feature>/` (phases 02–05).
- [x] `PrismaService` is a singleton `@Injectable()` — no raw `new PrismaClient()` instantiated in controllers.
- [x] `class-validator` decorators on DTOs; global `ValidationPipe` in `main.ts` with `whitelist: true, transform: true`.
- [x] Swagger module enabled in `main.ts` with tags per feature.

## Revisit trigger

- Revisit if NestJS maintenance stalls (no major release for 18 months) or if cold-start becomes a problem (e.g., a serverless deploy target forces <100ms boot).

## Links

- Related ADRs: 0001 (architecture), 0003 (database), 0005 (auth)
- PRD section: "In scope (MVP)"
- Playbook ref: `docs/_playbook/02-backend-stack.md`
