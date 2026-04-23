# ADR-0003: Database — PostgreSQL 16 + Prisma ORM

## Status

`Accepted`

## Date

2026-04-23

## Context

Access patterns (see `docs/schema-canvas.md`) are squarely relational: list meals by category + `active`, list orders by user + recency, list orders by status for admins, soft-delete meals, transactional order creation (order + N items must commit atomically). No vector search, no graph traversal, no geo queries, no time-series. Volume is a single restaurant's worth — thousands of rows, not millions. Consistency requirements are strong for orders (money, inventory) and strong-enough-for-demo elsewhere.

Playbook reference: `docs/_playbook/03-database.md` ("relational + ACID + <100 QPS → Postgres + typed ORM").

## Options considered

### Option A — PostgreSQL 16 + Prisma

- **Pros:** ACID transactions (required for `createOrder` atomicity), `array` type for `Meal.allergens` (no join table), `@@index` for `(categoryId, active)` and `(userId, createdAt)` access patterns, mature enum support (`OrderStatus`, `UserRole`); Prisma gives generated TS types → end-to-end type safety with shared-types lib; `prisma migrate dev` is a one-command schema evolution; `prisma db seed` fits the "one-command demo reset" story; Docker image is battle-tested.
- **Cons:** Prisma runtime adds ~15ms overhead to simple queries (irrelevant at demo scale); Prisma schema is a separate DSL, not SQL.
- **Cost / effort:** moderate — schema file + migration artifacts to maintain.
- **Reversibility:** medium — swapping Prisma for Drizzle or Kysely means rewriting every query; swapping Postgres for MySQL is a weekend.

### Option B — MongoDB + Mongoose

- **Pros:** schemaless accommodates rapid iteration on `Meal.options`; no migration files.
- **Cons:** orders are the most transactional part of the system and Mongo's multi-doc transactions are slower and more fragile than Postgres's defaults; no native enums (string unions fake it); `allergens` as an array is fine but sort+filter on `category+active` needs a compound index anyway; the "I used Mongo for a relational problem" story is a red flag on a portfolio, not a strength.
- **Cost / effort:** lower schema ceremony, higher query-shape risk.
- **Reversibility:** low — model choices cascade.

### Option C — SQLite + Prisma (file-based, single-writer)

- **Pros:** zero infra — the DB is a file in the repo; demo boots with no Docker.
- **Cons:** breaks the "I deployed Docker Compose with a real Postgres" portfolio talking point; WAL mode handles concurrent reads but Prisma's connection pooling model expects a server; any future deploy story (even "spun it up on Fly") requires migrating off.
- **Cost / effort:** lowest possible at demo time.
- **Reversibility:** high — Prisma abstracts the provider, flip `datasource db.provider` and regenerate.

## Decision

Postgres 16 via Docker Compose + Prisma 5+. The access patterns are relational; the orders workflow needs real transactions; and "I ran production-shape Postgres locally via compose" is exactly the signal the portfolio is meant to send.

## Consequences

### Positive

- `OrdersService.create` uses `prisma.$transaction(async tx => { ... })` to write `Order` + many `OrderItem` atomically — tested in phase 04.
- `@@index([categoryId, active])` makes the public menu query one index scan.
- `@@index([userId, createdAt])` covers the customer "my orders" listing; `@@index([status])` covers the admin status filter.
- Prisma's generated `UserRole` and `OrderStatus` enums are exported via `libs/shared-types` → single source of truth across api and web.
- Soft-delete on `Meal.deletedAt` keeps referential integrity for past orders pointing at discontinued meals.

### Negative / trade-offs we accept

- Full-text search on meal descriptions is not provided out of the box (would need `pg_trgm` or a separate search index). Not an MVP requirement; out of scope per PRD.
- Prisma's raw-SQL escape hatch is verbose; any query that needs window functions or CTEs falls off the ORM happy path.
- Migration files are committed artifacts that future contributors have to understand — tolerable at this size.

### What this decision forces us to do

- [x] `apps/api/src/prisma/prisma.service.ts` extends `PrismaClient`, connects on module init, disconnects on destroy.
- [x] `apps/api/src/prisma/prisma.module.ts` is imported by every feature module that needs DB access.
- [x] `prisma migrate dev --name <slug>` for every schema change — never hand-edit migration SQL.
- [x] `prisma/seed.ts` runs via `prisma db seed` (`package.json#prisma.seed`) and is idempotent (uses `upsert`).

## Revisit trigger

- Revisit if row counts on any table cross ~10M, if we add geo-queries (switch to PostGIS rather than abandon Postgres), or if multi-region latency becomes a requirement.

## Links

- Related ADRs: 0001 (architecture), 0002 (backend)
- PRD section: "In scope (MVP)"
- Playbook ref: `docs/_playbook/03-database.md`
- Data model: `docs/schema-canvas.md`
