# STRIDE-lite Threat Model — `oishi-sushi`

> A 30-minute exercise to surface the obvious risks before an attacker (or a code reviewer) does. Demo-scope, single-tenant, no payments — but recruiters read this section and judge whether I can think about security.

## 1. Asset inventory

| Asset                              | Why an attacker wants it                             | Class (public / internal / PII / secret) | Store                            |
| ---------------------------------- | ---------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| User email + password hash         | credential stuffing on other sites, account takeover | PII + sensitive                          | Postgres (`User.passwordHash`)   |
| Delivery address + phone           | stalking, doxxing, phishing                          | PII                                      | Postgres (`Order.*`)             |
| Session JWT (httpOnly cookie)      | account takeover without needing the password        | secret                                   | browser cookie jar               |
| `JWT_SECRET` (HS256 signing key)   | forge arbitrary session tokens, full impersonation   | secret                                   | `.env` (gitignored) / prod vault |
| Admin role flag on a `User` row    | grants menu CRUD + order-status mutation             | internal (authz)                         | Postgres (`User.role`)           |
| Postgres connection URL (password) | direct DB read/write, bypass all app-layer authz     | secret                                   | `.env` (gitignored)              |

## 2. Trust boundaries (sketch)

Data crosses three boundaries in the demo, more in a real deploy:

```
[Browser]  --TLS-->  [Angular SSR (Node, web:serve-ssr)]  --loopback HTTP-->  [NestJS api]
                                                                               |
                                                                               +--local TCP-->  [Postgres 16 (Docker compose)]
                                                                               |
                                                                               +--in-process fan-out--> [OrdersGateway (Socket.IO, same Node process)]

[Browser] --WS over TLS--> [OrdersGateway]  (cookie on handshake)
```

**Boundary notes:**

- **Browser ↔ SSR:** TLS in prod, plain HTTP on localhost in demo. `httpOnly SameSite=Lax` cookie protects the JWT.
- **SSR ↔ api:** loopback only. The SSR forwards the client's `Cookie` header verbatim on data fetches; there is no SSR-side secret that, if leaked, would escalate.
- **api ↔ Postgres:** same Docker network, no TLS (dev). `JWT_SECRET` and `DATABASE_URL` in `.env` — gitignored, grep-checked by pre-commit hook.
- **api ↔ Gateway:** same Node process, shared DI container — no network boundary, so no cross-process auth needed.

## 3. STRIDE-lite per boundary

| Threat                     | Where it applies                                            | Mitigation                                                                                                                                                                                                                                                                                      | Owner    |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **S**poofing identity      | Login, Socket.IO handshake                                  | bcrypt cost 12 on login; JWT HS256 signed by `JWT_SECRET`; gateway's `handleConnection` parses the cookie and verifies the JWT before allowing room subscriptions; rate-limit login (out of MVP scope — flagged as a gap).                                                                      | backend  |
| **T**ampering with data    | Client → api body payloads; URL parameters                  | Global `ValidationPipe({ whitelist: true, transform: true })` strips unknown fields; `class-validator` on every DTO; Prisma parameterizes every query (no string concatenation); cart totals recomputed server-side in `OrdersService.create` — never trusted from client body.                 | backend  |
| **R**epudiation            | Admin actions (meal CRUD, order status patches)             | Every admin action writes `updatedAt` + the action is derivable from the resulting state; a full audit log with `actorUserId + action + resourceId + timestamp` is desirable but out of MVP — flagged as a gap in "Risks".                                                                      | backend  |
| **I**nformation disclosure | Meal description field (stored HTML-ish strings)            | Angular's default binding is text-escaped (`{{ meal.description }}` — no `innerHTML`); the admin editor inputs a plain string, not a rich-text editor; Angular DomSanitizer would be needed if we ever allowed rich markup. No stack traces in api responses (`NODE_ENV=production` in deploy). | frontend |
| **I**nformation disclosure | Error responses on wrong-user order access                  | `/orders/:id` returns 403 (not 404) when the order exists but belongs to another user — this leaks existence, so we return 404 consistently for "not yours or doesn't exist". Documented in phase 04 spec.                                                                                      | backend  |
| **D**enial of service      | Public endpoints (`/menu`, `/auth/login`, `/auth/register`) | `body-parser` default 100kb limit; no rate limits in MVP — **gap**, would add `@nestjs/throttler` for login + register routes in a real deploy; Socket.IO concurrent-connection count is bounded by compose's Node process limits.                                                              | backend  |
| **E**levation of privilege | Role checks on admin endpoints + Socket.IO room membership  | `@Roles('admin')` + `RolesGuard` on every admin controller method; gateway's `handleConnection` sets `client.data.role = decoded.role`; `join('admin')` only for admins, `join('user:' + userId)` for customers; tenant-scoped queries (no global `findMany` without filter).                   | backend  |

## 4. Secrets inventory

| Secret                         | Where it lives                 | Rotation cadence | Who can read                                              |
| ------------------------------ | ------------------------------ | ---------------- | --------------------------------------------------------- |
| `DATABASE_URL`                 | `.env` (gitignored)            | never (demo)     | dev machine user; compose uses `POSTGRES_*` vars directly |
| `JWT_SECRET`                   | `.env` (gitignored)            | never (demo)     | dev machine user; api process                             |
| bcrypt salt rounds             | constant in code (cost = 12)   | n/a              | n/a                                                       |
| Seeded demo passwords          | `README.md` (by design — demo) | never            | anyone (they're demo-only)                                |
| GitHub Actions workflow tokens | GitHub default `GITHUB_TOKEN`  | per-run          | runner process                                            |

**Rules:**

- [x] No secret is in the repo. `.env` is gitignored (per `.gitignore`), `.env.example` holds shape with placeholders.
- [x] No secret is in a developer's `.env` shared on Slack — there's only one developer; `.env` was generated locally and never transmitted.
- [x] Pre-commit hook greps for common secret patterns (AWS keys, JWT signing keys) in staged diff — belt-and-braces against accidental paste.
- [x] Demo passwords in `README.md` are explicitly labeled as demo-only; the seeded `User` rows are re-seeded on every `prisma db seed`.

## 5. Incident response preamble

> Demo-scope, no real users, no on-call. This section exists so the shape is documented.

- **Who gets paged first:** nobody — demo. In a real deploy: the sole maintainer's pager.
- **Runbook location:** N/A for demo. In real deploy: `docs/runbook.md` (would be added when there's a prod).
- **Kill switches in place for:** `ADMIN_ENABLED` env flag to freeze the admin panel at boot (not implemented; called out as a future hardening).
- **Status page:** N/A.

## 6. Compliance scope (fill if applicable)

- [ ] **GDPR** — Users can register and place orders, but there's no "delete my account" endpoint (out of MVP). In a real deploy, a compliance pass would add it + `Right of Access` (export-my-data).
- [ ] **HIPAA** — N/A (no health data).
- [ ] **SOC2** — N/A (demo; would apply if sold to enterprise).
- [ ] **PCI** — Not applicable: the demo stores `totalCents` but does **not** process or transmit real card data. The PRD explicitly scopes out payment integration, so no Stripe Elements or equivalent either.

## 7. Known gaps (explicit, not forgotten)

These are security gaps I'm aware of but chose to defer as out-of-overnight-scope. Listed so a reviewer sees that I'm not hand-waving.

- No rate limiting on `/auth/login`, `/auth/register` — would add `@nestjs/throttler` with 5 req/min on `login` and 10 req/hour on `register`.
- No account lockout after N failed logins.
- No refresh-token rotation; access token is 1h TTL with no refresh.
- No `Content-Security-Policy` header on the SSR response — would add via Helmet middleware (`@fastify/helmet` equivalent for Nest).
- No audit log table for admin actions.
- No automated dependency scanning (Dependabot, Snyk) configured in CI.
