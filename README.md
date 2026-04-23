# oishi-sushi

Angular 21 + NestJS portfolio app — a sushi restaurant with customer ordering + admin management. Built in one overnight autonomous run by Claude Code to showcase advanced Angular: Signals, SSR, `@defer`, NgRx SignalStore, WebSockets, complex Reactive Forms, guards, resolvers, interceptors, and TDD throughout.

**Status:** this README is a stub. Phase 14 of the overnight build rewrites it with the full feature table, architecture diagram, screenshots, and demo credentials.

## Stack

- Angular 21, SSR, Tailwind
- NestJS 11, Passport JWT + httpOnly cookies, Socket.IO
- PostgreSQL 16 + Prisma 7 (via pg adapter)
- Nx 22 monorepo (pnpm)
- Jest (unit) + Playwright (e2e, chromium only)
- Husky + lint-staged pre-commit

## Quick start (once build completes)

```bash
docker compose up -d
pnpm install
pnpm prisma migrate deploy && pnpm db:seed
pnpm nx run @org/api:serve &
pnpm nx run web:serve-ssr
# Open http://localhost:4200
```

## Demo credentials (seeded)

- Admin: `admin@oishi.dev` / `demo-admin-pass`
- Customer: `customer@oishi.dev` / `demo-customer-pass`

## Overnight build status

Check `STATE.md` for current phase, `docs/_playbook/_overnight-plan.md` for the full plan.

## License

MIT
