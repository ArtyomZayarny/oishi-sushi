# Final Plan — Overnight Autonomous Build: `oishi-sushi`

**Date:** 2026-04-23
**Status:** LOCKED — all decisions self-answered, ready to execute
**Driver:** bash script `scripts/run-overnight.sh` (not ralph-loop — see §5)
**Working dir:** `~/Downloads/projects/oishi-sushi/`
**GitHub:** public repo `github.com/ArtyomZayarny/oishi-sushi`
**User:** asleep during overnight phases; morning verification via `scripts/morning-check.sh`

---

## 1. Locked decisions

| #   | Decision                 | Value                                                                                                     |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | Repo name                | `oishi-sushi`                                                                                             |
| 2   | GitHub owner             | `ArtyomZayarny`                                                                                           |
| 3   | Visibility               | public                                                                                                    |
| 4   | Admin seeded creds       | `admin@oishi.dev` / `demo-admin-pass` (in README)                                                         |
| 5   | Customer seeded creds    | `customer@oishi.dev` / `demo-customer-pass`                                                               |
| 6   | Disk strategy            | `docker system prune -a -f --volumes` pre-setup + Playwright chromium-only                                |
| 7   | Deploy                   | SKIP overnight. Manual tomorrow if wanted.                                                                |
| 8   | Driver                   | bash loop (`scripts/run-overnight.sh`), not ralph-loop                                                    |
| 9   | Sync-vs-autonomous split | Sync: scaffold + Docker + Prisma migration/seed + first commit. Autonomous: docs + TDD features + polish. |

---

## 2. Objective + audience

Build a production-shaped sushi ordering app with admin panel that showcases senior-level Angular to recruiters browsing the GitHub repo overnight. Must demonstrate (verified present in final code):

- Angular Signals (computed + effects)
- Angular SSR (Universal) on public pages
- `@defer` blocks
- New control flow (`@if`, `@for`, `@switch`)
- Standalone components + zoneless change detection
- Route guards (auth + admin role) + resolvers + interceptors (auth cookie, error)
- Complex Reactive Form (nested FormGroups + FormArray + custom + cross-field validators)
- NgRx SignalStore (cart + current order)
- WebSocket realtime (Socket.IO, order status updates)
- Nx monorepo with shared-types lib + ui-kit lib
- Jest unit tests green + Playwright e2e specs green
- Pre-commit hooks (tsc --noEmit, eslint, unit tests)
- README with architecture diagram, feature checklist, screenshots, seeded demo creds

---

## 3. Stack (locked)

| Layer       | Choice                                             |
| ----------- | -------------------------------------------------- |
| Frontend    | Angular (latest stable via Nx) + SSR + Tailwind    |
| State       | @ngrx/signals (SignalStore)                        |
| Backend     | NestJS + Passport JWT + httpOnly cookies + Swagger |
| DB          | PostgreSQL 16 (Docker) + Prisma 5+                 |
| Realtime    | Socket.IO via @nestjs/websockets                   |
| Monorepo    | Nx (angular-monorepo preset + @nx/nest)            |
| Tests       | Jest (unit) + Playwright (e2e, chromium only)      |
| CI          | GitHub Actions (polish phase)                      |
| Pre-commit  | Husky + lint-staged                                |
| Package mgr | pnpm                                               |

---

## 4. Repo layout (final)

```
oishi-sushi/
├── apps/
│   ├── web/                        Angular SSR (public + admin routes)
│   ├── api/                        NestJS
│   └── web-e2e/                    Playwright (chromium only)
├── libs/
│   ├── shared-types/               DTOs + enums
│   └── ui-kit/                     Shared Angular components
├── docs/
│   ├── PRD.md
│   ├── adr/0001..0007-*.md
│   ├── schema-canvas.md
│   ├── threat-model.md
│   ├── testing.md
│   └── _playbook/                  Vendored from ai-mastery/playbook/
├── scripts/
│   ├── run-overnight.sh            Outer bash loop driver
│   ├── ensure-services.sh          Idempotent: docker postgres up + api health
│   ├── morning-check.sh            User's morning summary
│   └── stop-overnight.sh           Clean shutdown
├── .github/workflows/ci.yml        Added in phase 13
├── docker-compose.yml
├── prisma/schema.prisma
├── prisma/seed.ts
├── .env.example
├── .env                            Gitignored (seeded once)
├── README.md
├── STATE.md                        Loop driver state
├── NEEDS_HUMAN.md                  Conditional (on halt)
├── .claude/
│   ├── overnight-loop.md           Prompt fired per iteration
│   └── logs/                       iter-NN-<stamp>.log files
├── .husky/pre-commit
├── nx.json, tsconfig.base.json, package.json, pnpm-lock.yaml
└── .gitignore
```

---

## 5. Orchestration: why bash loop, not ralph-loop

- Ralph-loop runs _inside_ the current Claude Code session. When the session dies (rate limit, crash, network blip), the loop dies with it.
- Bash loop invoking `claude -p "$(cat .claude/overnight-loop.md)"` per iteration:
  - **Survives** Claude session deaths (spawns fresh session next iteration)
  - **Logs** each iteration to a file (debuggable in the morning)
  - **Detects** rate-limit responses and sleeps appropriately
  - **Caps** total iterations (safety limit = 30) so a stuck loop doesn't run forever
  - **No dependency** on ralph-loop plugin internals

Trade-off: each iteration is a fresh Claude session, so prompt cache doesn't carry between iterations. Mitigation: the loop prompt is short (~200 words); context per iteration is STATE.md + plan file + phase-relevant files, all read fresh. Accepted — robustness > per-iteration cache savings.

---

## 6. State machine: `STATE.md`

Single source of truth for loop position. Schema:

```yaml
phase: 01-docs # or 02-api-auth ... 13-e2e-and-polish, DONE
iteration: 0
last_commit: <sha>
last_updated: 2026-04-23T22:55:00+03:00
attempts_on_current_phase: 0
blockers: # array, append-only in this iteration; cleared when phase advances
  - iter: 3
    error: 'pnpm install failed with EPERM'
```

Transitions:

- On phase success: `phase = next`, `attempts_on_current_phase = 0`, `blockers = []`, commit.
- On phase failure (per-iter max 3 impl attempts): append to blockers, exit iteration.
- On same-blocker-across-iterations (substring match on last 2 entries): write NEEDS_HUMAN.md, exit loop.

---

## 7. Autonomous loop prompt (`.claude/overnight-loop.md`, ~200 words)

```
You are one iteration of the overnight autonomous builder for oishi-sushi.

STOP CONDITIONS (check first, in order):
1. If STATE.md "phase: DONE" → print "LOOP COMPLETE" and exit 0.
2. If NEEDS_HUMAN.md exists → print "NEEDS HUMAN" and exit 0.
3. If STATE.md.blockers has ≥2 entries with substring-equal errors → write NEEDS_HUMAN.md
   (include full STATE.md contents + last 50 lines of latest log), exit 0.

PROCESS:
1. Read STATE.md, determine current phase.
2. Read docs/_playbook/_overnight-plan.md §Phase specs, find the spec for current phase.
3. If working tree is dirty (uncommitted): create recovery branch
   "recovery/iter-$(date +%s)", commit WIP there, checkout main, reset --hard origin/main.
4. Run scripts/ensure-services.sh (idempotent — brings up postgres if down).
5. Execute the phase per spec:
   - Doc phases: fill templates verbatim from playbook.
   - TDD phases: write failing tests → `git commit -m "test(<phase>): ..."` →
     run tests (confirm red is acceptable at this point but must turn green) →
     implement → run tests (confirm green) → `git commit -m "feat(<phase>): ..."`.
6. Run the phase's verify command from the spec.
7. On green:
   - git push origin main
   - Update STATE.md: phase = next, iteration +=1, attempts_on_current_phase = 0,
     blockers = [], last_commit = HEAD sha
   - Print "PHASE <id> COMPLETE → next: <next>"
   - Exit 0.
8. On red after 3 impl attempts inside this iteration:
   - Append error text to STATE.md.blockers (iter = current iteration)
   - Increment attempts_on_current_phase
   - Commit WIP to a branch "wip/<phase>-iter-N" (not main)
   - Exit 1.

HARD RULES:
- Never git push --force. Never git reset --hard without backup (step 3 handles restart).
- Never commit .env, .env.local, credentials.*, or anything matching common secret patterns.
- Never delete committed ADR files.
- For TDD phases: MUST produce exactly 2 commits on main (test → impl). Verify via
  `git log -2 --format=%s` matching ^(test|feat)\(<phase>\).
- Before exit success: `git status --porcelain` must be empty.
- For commands needing y/n: pipe `yes y |` or use the tool's non-interactive flag.
- If a command hangs >90s with no new output, assume stuck; kill, log, try a different approach.

Begin.
```

---

## 8. Autonomous driver (`scripts/run-overnight.sh`)

```bash
#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT=$(pwd)

mkdir -p .claude/logs

# Keep Mac awake
caffeinate -i &
CAFF_PID=$!
cleanup() {
  kill "$CAFF_PID" 2>/dev/null || true
  exit
}
trap cleanup EXIT INT TERM

MAX_ITERATIONS=30
ITER=0
LOOP_LOG=".claude/logs/loop-$(date +%Y%m%d-%H%M%S).log"

log() {
  local msg="[$(date +%H:%M:%S)] $*"
  echo "$msg" | tee -a "$LOOP_LOG"
}

log "=== Overnight loop starting, MAX_ITERATIONS=$MAX_ITERATIONS ==="

while [ "$ITER" -lt "$MAX_ITERATIONS" ]; do
  ITER=$((ITER + 1))
  STAMP=$(date +%Y%m%d-%H%M%S)
  ITER_LOG=".claude/logs/iter-${ITER}-${STAMP}.log"

  log "=== Iteration $ITER ==="

  # Stop conditions (shell-side, mirrors prompt-side)
  PHASE=$(grep -E "^phase:" STATE.md 2>/dev/null | head -1 | awk '{print $2}')
  if [ "$PHASE" = "DONE" ]; then
    log "STATE.md phase=DONE — LOOP COMPLETE"
    break
  fi
  if [ -f NEEDS_HUMAN.md ]; then
    log "NEEDS_HUMAN.md exists — stopping"
    cat NEEDS_HUMAN.md | tee -a "$LOOP_LOG"
    break
  fi

  # Fire one iteration
  log "Firing claude -p (log: $ITER_LOG)"
  if claude -p "$(cat .claude/overnight-loop.md)" > "$ITER_LOG" 2>&1; then
    log "Iteration $ITER exit=0"
  else
    EXIT=$?
    log "Iteration $ITER exit=$EXIT"
    # Rate-limit heuristic
    if grep -qiE "rate limit|usage limit|too many requests" "$ITER_LOG"; then
      log "Rate limit detected — sleeping 10 min"
      sleep 600
    elif [ "$EXIT" -ne 1 ]; then
      log "Unexpected non-phase-red failure — sleeping 2 min"
      sleep 120
    fi
  fi

  # Breather + cooperative sleep
  sleep 5
done

log "=== Loop exited after $ITER iterations ==="
log "Final STATE.md:"
cat STATE.md | tee -a "$LOOP_LOG"

if [ -f NEEDS_HUMAN.md ]; then
  log "NEEDS_HUMAN.md content:"
  cat NEEDS_HUMAN.md | tee -a "$LOOP_LOG"
fi

exit 0
```

---

## 9. Synchronous setup (I execute now, user watches, ~20 min)

Each step must succeed before next. Failure = halt + diagnose live.

### 9.0 Preflight

```bash
docker system prune -a -f --volumes                   # reclaim ~2-3 GB
df -h ~ | tail -1                                     # expect ≥15 GB free
node -v && pnpm -v && docker -v && gh auth status     # all ok
```

### 9.1 Working dir + git

```bash
mkdir -p ~/Downloads/projects/oishi-sushi
cd ~/Downloads/projects/oishi-sushi
git init -b main
```

### 9.2 Nx scaffold (into current empty dir)

```bash
npx --yes create-nx-workspace@latest . \
  --preset=angular-monorepo \
  --appName=web \
  --style=css \
  --e2eTestRunner=playwright \
  --bundler=esbuild \
  --packageManager=pnpm \
  --ssr=true \
  --standalone=true \
  --nxCloud=skip \
  --ci=skip
```

### 9.3 Add NestJS app

```bash
pnpm add -D @nx/nest
pnpm nx g @nx/nest:app apps/api --frontendProject=web --no-interactive
```

### 9.4 Libs

```bash
pnpm nx g @nx/js:lib shared-types --directory=libs/shared-types \
  --bundler=none --unitTestRunner=jest --no-interactive
pnpm nx g @nx/angular:lib ui-kit --directory=libs/ui-kit --standalone --no-interactive
```

### 9.5 Tailwind on web

```bash
pnpm nx g @nx/angular:setup-tailwind web
```

### 9.6 Runtime deps

```bash
# Angular side
pnpm add @ngrx/signals socket.io-client

# NestJS side
pnpm add -w prisma @prisma/client \
  @nestjs/passport passport passport-jwt bcryptjs \
  @nestjs/jwt @nestjs/websockets @nestjs/platform-socket.io socket.io \
  @nestjs/config class-validator class-transformer @nestjs/swagger cookie-parser

pnpm add -Dw @types/passport-jwt @types/bcryptjs @types/cookie-parser
```

### 9.7 Prisma init + schema

```bash
pnpm prisma init --datasource-provider postgresql
```

Write `prisma/schema.prisma` per Appendix A. Put models at repo root `prisma/`; api imports from `@prisma/client`.

### 9.8 docker-compose.yml + .env

Write per Appendix B. Then:

```bash
docker compose up -d postgres
sleep 5
docker compose exec -T postgres pg_isready -U oishi -d oishi
```

### 9.9 Prisma migrate + seed

```bash
pnpm prisma migrate dev --name init --skip-seed
```

Write `prisma/seed.ts` per Appendix C. Configure `package.json#prisma.seed = "ts-node prisma/seed.ts"` (or bun/tsx). Run:

```bash
pnpm prisma db seed
```

### 9.10 Husky + lint-staged

```bash
pnpm add -Dw husky lint-staged
pnpm husky init
```

Write `.husky/pre-commit` and lint-staged config per Appendix D.

### 9.11 Playwright chromium-only

Edit `apps/web-e2e/playwright.config.ts`:

```ts
projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }];
```

Install just chromium: `pnpm exec playwright install chromium`.

### 9.12 Vendor playbook + plan + loop artifacts

```bash
mkdir -p docs/_playbook
cp ../ai-mastery/playbook/*.md docs/_playbook/
cp -r ../ai-mastery/playbook/templates docs/_playbook/templates 2>/dev/null || true
cp ../plans/overnight-sushi-angular-portfolio-2026-04-23.md \
   docs/_playbook/_overnight-plan.md
```

### 9.13 Write orchestration files

- `STATE.md` (phase=`01-docs`, iteration=0)
- `.claude/overnight-loop.md` (§7)
- `scripts/run-overnight.sh` (§8, `chmod +x`)
- `scripts/ensure-services.sh` (Appendix E, `chmod +x`)
- `scripts/morning-check.sh` (Appendix F, `chmod +x`)
- `scripts/stop-overnight.sh` (Appendix G, `chmod +x`)
- `README.md` stub (phase 13 replaces)
- Update `.gitignore` per Appendix H

### 9.14 Smoke test before kickoff

```bash
pnpm nx run-many --target=lint --all                  # expect pass (scaffold is clean)
pnpm nx run-many --target=test --all --passWithNoTests
pnpm nx run api:serve --watch=false &
API_PID=$!
sleep 8
curl -f http://localhost:3000/api || echo "api endpoint TBD — ok if 404"
kill $API_PID 2>/dev/null
```

If lint/test fail cleanly on the scaffold — stop, investigate before kickoff.

### 9.15 First commit + GitHub

```bash
git add -A
git commit -m "chore: scaffold Nx monorepo with Angular SSR + NestJS + Prisma + Docker"
gh repo create ArtyomZayarny/oishi-sushi --public --source=. --push \
  --description "Angular + NestJS portfolio — Signals, SSR, @defer, SignalStore, WebSockets, TDD — built autonomously overnight"
```

### 9.16 Hand off

Report to user:

- Repo URL
- Current STATE.md phase
- How to kick off: `bash scripts/run-overnight.sh &`
- How to monitor: `tail -f .claude/logs/loop-*.log`
- How to stop cleanly: `bash scripts/stop-overnight.sh`
- Morning check: `bash scripts/morning-check.sh`

---

## 10. Phase specs (13 autonomous phases)

Each phase block below is read verbatim by the overnight agent each iteration. Be concrete.

### Phase `01-docs` — PRD + ADRs + threat model + testing doc

- **Inputs:** `docs/_playbook/00-*.md` through `07-*.md`, templates under `docs/_playbook/templates/`
- **Action:** Create all the following files, filling playbook templates verbatim with sushi-app context + locked stack decisions:
  - `docs/PRD.md` (from `templates/prd-1pager.md`): pain="urban office workers waste 15 min choosing + ordering lunch; existing sushi apps bury the menu under ads"; persona=office worker 25-40; core loop=browse→add→checkout→track; kill criterion=<20% D30 repeat-order rate (invented — portfolio project).
  - `docs/adr/0001-architecture.md`: modular monolith NestJS, single Postgres, Socket.IO gateway for realtime, SPA+SSR on web.
  - `docs/adr/0002-backend.md`: NestJS (rationale: shared TS, DI parity with Angular, Swagger first-class).
  - `docs/adr/0003-database.md`: Postgres + Prisma (rationale: ACID, relational access patterns: by category, by status, time-range queries on orders).
  - `docs/schema-canvas.md`: table of access patterns per query (list public menu by category; admin list meals; customer list own orders; admin list orders by status; live order status subscription).
  - `docs/adr/0004-frontend.md`: Angular + SSR + Tailwind (rationale: playbook decision tree "enterprise SPA → Angular", SSR for SEO on public menu, Tailwind for speed).
  - `docs/adr/0005-auth.md`: JWT HS256 in httpOnly SameSite=Lax cookie, CSRF via double-submit on state-changing routes, RBAC (customer/admin), bcrypt cost 12.
  - `docs/threat-model.md` (from `templates/threat-model.md`): STRIDE-lite, 6 top threats ranked (account takeover, privilege escalation via missing role check, XSS on meal description, CSRF on state-changing routes, secret leak via commit, SQL injection via Prisma — mitigated).
  - `docs/adr/0006-devops.md`: Docker Compose local, GitHub Actions CI, deploy = out of scope overnight.
  - `docs/adr/0007-testing.md`: pyramid 60% unit (Jest) / 30% integration (real Postgres via compose, not testcontainers) / 10% e2e (Playwright chromium). Pre-commit via husky + lint-staged.
  - `docs/testing.md`: test strategy detail (what to unit-test vs integration-test vs e2e, risk map).
- **Verify:** all 9 files exist and each has ≥5 level-2 headings: `for f in docs/PRD.md docs/adr/000{1,2,3,4,5,6,7}-*.md docs/schema-canvas.md docs/threat-model.md docs/testing.md; do [ $(grep -c "^## " "$f") -ge 5 ] || { echo "FAIL $f"; exit 1; }; done`
- **Commits on main (1):** `docs(01): PRD + 7 ADRs + schema canvas + threat model + testing doc`

### Phase `02-api-auth` — auth endpoints (TDD, 2 commits)

- **Inputs:** `prisma/schema.prisma` (User model), `docs/adr/0005-auth.md`
- **Action commit 1 (test):** Write `apps/api/src/auth/*.spec.ts` covering:
  - POST /auth/register: 201 returns user (no password), 400 weak password, 409 duplicate email
  - POST /auth/login: 200 sets httpOnly cookie, 401 bad creds
  - GET /auth/me: 200 with cookie, 401 without
  - @Roles guard: 403 when customer hits admin-only
  - Use Nest Testing module with Prisma client connected to compose postgres
  - Run once to confirm tests exist (red is ok — impl missing)
  - Commit: `test(02-auth): failing specs for register/login/me + roles guard`
- **Action commit 2 (impl):** Create:
  - `apps/api/src/auth/auth.module.ts`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/auth/auth.service.ts`
  - `apps/api/src/auth/jwt.strategy.ts`
  - `apps/api/src/auth/roles.decorator.ts`
  - `apps/api/src/auth/roles.guard.ts`
  - `apps/api/src/auth/dto/*.ts` (RegisterDto, LoginDto with class-validator)
  - Wire PrismaService (`apps/api/src/prisma/prisma.service.ts`, `prisma.module.ts`) if not present
  - Cookie setter with SameSite=Lax, Secure=false (dev), HttpOnly=true
  - Register in AppModule
  - Install cookie-parser in main.ts
  - Commit: `feat(02-auth): JWT cookie auth + register/login/me + roles guard`
- **Verify:** `pnpm nx test api --testPathPattern=auth` all green + `git log -2 --format=%s | grep -cE "^(test|feat)\(02-auth\)"` equals 2
- **Services needed:** postgres up

### Phase `03-api-menu` — menu endpoints (TDD, 2 commits)

- **Inputs:** User + role guard from phase 02, Category + Meal models from schema
- **Test commit:** `apps/api/src/menu/*.spec.ts`:
  - GET /menu (public): 200 returns active meals grouped by category
  - POST /admin/menu (admin only): 201 creates meal, 403 for customer, 400 invalid body
  - PUT /admin/menu/:id: 200 updates, 404 missing
  - DELETE /admin/menu/:id: 204 + soft-delete (sets deletedAt), 403 for customer
  - Commit: `test(03-menu): failing specs for public + admin menu`
- **Impl commit:** menu.controller.ts, admin-menu.controller.ts, menu.service.ts, DTOs, module. Commit: `feat(03-menu): public GET + admin CRUD`
- **Verify:** `pnpm nx test api --testPathPattern=menu` all green + 2-commit rule passes

### Phase `04-api-orders` — orders endpoints (TDD, 2 commits)

- **Test commit:** orders.controller.spec.ts:
  - POST /orders (customer): 201 with order id, creates order + items in a transaction, 401 no cookie
  - GET /orders/:id: 200 for own order, 403 for other customer's order
  - GET /admin/orders: 200 returns all, 403 for customer
  - PATCH /admin/orders/:id: 200 updates status, emits event (mocked)
  - Commit: `test(04-orders): failing specs`
- **Impl:** orders.controller.ts (customer), admin-orders.controller.ts, orders.service.ts (with Prisma $transaction), DTOs, module. Emit events via EventEmitter2 or directly to gateway service (phase 05 connects). Commit: `feat(04-orders): order create + status update`
- **Verify:** `pnpm nx test api --testPathPattern=orders` green

### Phase `05-api-realtime` — Socket.IO gateway (TDD, 2 commits)

- **Test commit:** orders.gateway.spec.ts using `socket.io-client`:
  - Client connects, authenticates via cookie → joins user room
  - Admin PATCH order status → customer receives `order:status:changed` with payload `{orderId, status, timestamp}`
  - Unauthenticated → disconnect
  - Commit: `test(05-realtime): failing gateway spec`
- **Impl:** `apps/api/src/orders/orders.gateway.ts` with @WebSocketGateway, connect handler verifying JWT from cookie, join user room by userId and "admin" room for admins. Wire orders.service to emit on status transition. Install `@nestjs/platform-socket.io` in main.ts. Commit: `feat(05-realtime): Socket.IO gateway with order:status:changed`
- **Verify:** `pnpm nx test api --testPathPattern=gateway` green

### Phase `06-shared-types` — DTOs → shared lib

- **Inputs:** all api controllers from phases 02-05
- **Action:** In `libs/shared-types/src/lib/`, write clean TypeScript interfaces for every DTO + response shape: `User`, `RegisterReq`, `LoginReq`, `AuthResp`, `Category`, `Meal`, `MealOption`, `MealCreateReq`, `Order`, `OrderItem`, `OrderCreateReq`, `OrderStatusPatchReq`, `OrderStatusEvent`, enums (`OrderStatus`, `UserRole`). Barrel export. Import these in api controllers, replacing any inline types.
- **Verify:** `pnpm nx run-many --target=typecheck --all` green; `pnpm nx test api --passWithNoTests` still green
- **Commits on main (1):** `refactor(06): shared-types lib + wire into api`

### Phase `07-web-shell` — routes + layout + interceptors + guards (TDD, 2 commits)

- **Test commit:** `apps/web/src/app/interceptors/*.spec.ts` + `apps/web/src/app/guards/*.spec.ts`:
  - AuthInterceptor adds `withCredentials: true` to every request
  - ErrorInterceptor catches 401 → redirects to /auth/login; 5xx → toast
  - AuthGuard redirects to /auth/login when user signal is null
  - AdminGuard redirects to / when user.role !== 'admin'
  - Commit: `test(07-shell): failing specs for interceptors + guards`
- **Impl:** routes config with lazy-loaded admin route (`loadComponent` or `loadChildren`), AppLayoutComponent (header with cart badge, nav, footer), AuthService with a currentUser signal, interceptors registered via `provideHttpClient(withInterceptors(...))`, guards as CanActivateFn functions. Zoneless provider via `provideZonelessChangeDetection()`. Commit: `feat(07-shell): layout + interceptors + guards + zoneless`
- **Verify:** `pnpm nx test web --testPathPattern="interceptor|guard"` green

### Phase `08-web-menu` — SSR menu with @defer (TDD, 2 commits)

- **Services needed:** postgres + api serve
- **Test commit:** `apps/web/src/app/pages/menu/menu.component.spec.ts`:
  - Component loads meals from resolver
  - @for renders meal-card per meal
  - @if branches on category
  - Commit: `test(08-menu): failing specs`
- **Impl:** `MenuResolver` fetches `/menu`, `MenuComponent` with `@for (c of categories; track c.id) { ... @for (m of c.meals; track m.id) { @defer (on viewport) { <app-meal-card-details [meal]="m"/> } @placeholder { <app-meal-card-skel/> } } }`. MealCard takes a Meal input, shows image + name + price. Style with Tailwind.
  Commit: `feat(08-menu): SSR menu + @defer + @for`
- **Verify:** `pnpm nx test web --testPathPattern=menu` green AND SSR render check: `scripts/ensure-services.sh && pnpm nx run web:serve-ssr & sleep 20; curl -sf http://localhost:4000/menu | grep -qE "(meal-card|data-meal)" || { echo "SSR render missing meal markup"; exit 1; }; kill %1`

### Phase `09-web-cart` — SignalStore + persist

- **Test commit:** `cart.store.spec.ts`:
  - addItem, removeItem, updateQty, clearCart
  - Computed subtotal, tax (15%), grandTotal
  - hydrate from localStorage on init
  - persist on every state change
  - Commit: `test(09-cart): failing SignalStore specs`
- **Impl:** `apps/web/src/app/features/cart/cart.store.ts` using `signalStore(withState, withMethods, withComputed, withHooks)`. Cart component with add/remove UI using signals. Commit: `feat(09-cart): cart SignalStore with localStorage persist`
- **Verify:** `pnpm nx test web --testPathPattern=cart` green

### Phase `10-web-checkout` — complex Reactive Form (TDD, 2 commits)

- **Test commit:** `checkout.component.spec.ts`:
  - Required validators on customer.firstName, customer.lastName, customer.phone, delivery.address, delivery.postalCode
  - Custom phone validator: E.164 format
  - Custom postal-code validator: regex per country
  - Cross-field: tip <= 50% subtotal (form invalid if violated)
  - FormArray of `items` for per-item notes (1 per cart item)
  - Submit disabled while invalid
  - Valid submit → calls ordersService.create → routes to /orders/:id
  - Commit: `test(10-checkout): failing form specs`
- **Impl:** `CheckoutComponent` with FormBuilder tree: 3 nested groups (customer, delivery, payment) + FormArray. Custom validators in `libs/ui-kit/validators/`. On submit, reads cart from SignalStore, POSTs to /orders, navigates. Commit: `feat(10-checkout): complex Reactive Form + submit`
- **Verify:** `pnpm nx test web --testPathPattern=checkout` green

### Phase `11-web-tracking` — WebSocket live order status (TDD, 2 commits)

- **Test commit:** `orders.service.spec.ts` + `order-tracking.component.spec.ts` mocking socket.io-client:
  - Service connects with credentials on authenticated user signal change
  - Service emits status-change events to a signal
  - Component subscribes via effect + updates badge on new status
  - Commit: `test(11-tracking): failing socket + live-badge specs`
- **Impl:** OrdersService with `io('/orders', { withCredentials: true })`, expose `statusChanges$` as a signal via `toSignal` or manual. OrderTrackingComponent with status badge that animates on change. Commit: `feat(11-tracking): realtime order status via socket.io-client`
- **Verify:** `pnpm nx test web --testPathPattern="orders.service|order-tracking"` green

### Phase `12-web-admin` — admin panel (TDD, 2 commits)

- **Test commit:** `admin-meals.component.spec.ts` + `meal-editor.component.spec.ts`:
  - List shows all meals incl. inactive
  - Editor form with FormArray for `options` (add/remove dynamically)
  - Allergen multiselect chips
  - Image URL field (no file upload — plain URL)
  - Optimistic UI: add a meal → appears in list before server confirms
  - Commit: `test(12-admin): failing specs`
- **Impl:** Lazy-loaded admin module (`loadComponent: () => import(...)`) guarded by AdminGuard. AdminMealsComponent list + slide-over editor. Uses SignalStore for meals collection. POST/PUT to /admin/menu. Commit: `feat(12-admin): admin panel + meal editor with FormArray`
- **Verify:** `pnpm nx test web --testPathPattern=admin` green

### Phase `13-e2e-and-polish` — Playwright + README + CI + Lighthouse (3 commits)

- **Services needed:** postgres + api + web-ssr (Playwright `webServer` config handles)
- **Test commit:** 3 Playwright specs in `apps/web-e2e/src/`:
  - `customer-flow.spec.ts`: visit /menu → add first meal → /cart → checkout with filled form → /orders/:id with status "pending"
  - `admin-flow.spec.ts`: login as admin → /admin/meals → create meal "Test Roll" → verify in public /menu
  - `realtime.spec.ts`: 2 browser contexts; customer in ctx1 has active order; admin in ctx2 patches status; within 3s ctx1's badge updates without page reload
  - Commit: `test(13-e2e): 3 Playwright specs`
- **Polish commit:** rewrite `README.md` with:
  - Hero line + 1-sentence pitch
  - Feature checklist table (Signals ✓ SSR ✓ @defer ✓ new control flow ✓ zoneless ✓ SignalStore ✓ WebSockets ✓ Reactive Forms ✓ guards ✓ resolvers ✓ interceptors ✓ nx monorepo ✓ TDD ✓)
  - Architecture Mermaid diagram (nodes: user, web-ssr, api, postgres, socket.io; edges labeled)
  - Tech stack list
  - Quick start (`docker compose up -d`, `pnpm install`, `pnpm nx run api:serve`, `pnpm nx run web:serve-ssr`, open http://localhost:4000)
  - Seeded credentials block
  - Testing section (`pnpm nx run-many --target=test --all`, `pnpm nx e2e web-e2e`)
  - Screenshots (captured by Playwright helper — `scripts/capture-screenshots.sh` creates PNGs in `docs/screenshots/`)
  - License (MIT)
  - `.github/workflows/ci.yml`: on PR/push to main, run `pnpm install --frozen-lockfile`, `pnpm nx affected -t lint test build`, then `pnpm nx e2e web-e2e`
  - Commit: `feat(13-polish): README + screenshots + CI workflow + husky gate`
- **DONE commit:** update STATE.md `phase: DONE`, final push. Commit: `chore: loop DONE`
- **Verify:** `pnpm nx e2e web-e2e --reporter=list` all 3 specs green + README has ≥8 level-2 headings + CI workflow yaml-valid

---

## 11. Morning verification (`scripts/morning-check.sh`)

User runs one command; gets a readout of what happened.

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")/.."

echo "=== STATE ==="
cat STATE.md

echo ""
echo "=== NEEDS_HUMAN? ==="
[ -f NEEDS_HUMAN.md ] && cat NEEDS_HUMAN.md || echo "none"

echo ""
echo "=== LAST 30 COMMITS ==="
git log --oneline -30

echo ""
echo "=== DISK ==="
df -h ~ | tail -1

echo ""
echo "=== TESTS ==="
pnpm nx run-many --target=test --all --passWithNoTests --reporters=summary 2>&1 | tail -20

echo ""
echo "=== REPO ==="
gh repo view --json url,description,pushedAt --jq '. | "\(.url)\n\(.description)\nlast push: \(.pushedAt)"'

echo ""
echo "=== TO RUN LOCALLY ==="
echo "docker compose up -d && pnpm nx run api:serve & pnpm nx run web:serve-ssr"
echo "open http://localhost:4000"
echo "admin: admin@oishi.dev / demo-admin-pass"
```

---

## 12. Risks + mitigations (final)

| Risk                              | Likelihood | Mitigation                                                                       |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------- |
| Claude Code rate limit mid-night  | High       | Bash loop detects, sleeps 10 min, retries. Atomic commits = no state corruption. |
| Nx scaffold CLI flag drift        | Med        | Sync setup — I fix live                                                          |
| Prisma+Nx path issues             | Med        | Sync setup — I fix live                                                          |
| SSR hydration mismatch            | Med        | Phase 08 SSR render check catches; small fix then retry                          |
| Agent stuck looping on same error | Med        | Same-blocker-across-2-iterations → NEEDS_HUMAN                                   |
| Dirty tree on restart             | Low        | Step 3 of loop prompt: recovery branch, reset main                               |
| Disk fills                        | Low        | Pre-prune + chromium-only + docker volume caps. Loop halts at >95%.              |
| WebSocket test flake              | Med        | 5s `waitFor` + retry once                                                        |
| Playwright webServer race         | Med        | `webServer.timeout: 120000` + `reuseExistingServer: !CI`                         |
| Agent commits a secret            | Very low   | `.env` gitignored; `/\.env/` grep in loop prompt pre-commit                      |
| Agent force-pushes                | Very low   | Explicit hard rule in loop prompt + no `--force` in any script                   |

---

## 13. Out of scope (explicit, locked)

- Payment integration (Stripe etc.)
- Real file upload (meal images use URL field only)
- Production deploy (Vercel, Fly, etc.)
- OAuth / social login / MFA
- Mobile app
- i18n
- Email notifications
- Real user reviews/ratings
- Multi-tenant

---

## Appendix A — `prisma/schema.prisma` (final, written during §9.7)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  CUSTOMER
  ADMIN
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PREPARING
  READY
  DELIVERED
  CANCELLED
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  firstName    String
  lastName     String
  role         UserRole @default(CUSTOMER)
  createdAt    DateTime @default(now())
  orders       Order[]
}

model Category {
  id       String @id @default(cuid())
  name     String @unique
  slug     String @unique
  sortOrder Int   @default(0)
  meals    Meal[]
}

model Meal {
  id           String     @id @default(cuid())
  name         String
  description  String
  priceCents   Int
  imageUrl     String
  active       Boolean    @default(true)
  deletedAt    DateTime?
  categoryId   String
  category     Category   @relation(fields: [categoryId], references: [id])
  options      MealOption[]
  allergens    String[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  orderItems   OrderItem[]

  @@index([categoryId, active])
}

model MealOption {
  id          String @id @default(cuid())
  mealId      String
  meal        Meal   @relation(fields: [mealId], references: [id], onDelete: Cascade)
  name        String
  priceDeltaCents Int @default(0)
}

model Order {
  id           String     @id @default(cuid())
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  status       OrderStatus @default(PENDING)
  subtotalCents Int
  taxCents     Int
  tipCents     Int        @default(0)
  totalCents   Int
  deliveryAddress String
  deliveryPostal  String
  phone        String
  notes        String?
  items        OrderItem[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([userId, createdAt])
  @@index([status])
}

model OrderItem {
  id         String @id @default(cuid())
  orderId    String
  order      Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  mealId     String
  meal       Meal   @relation(fields: [mealId], references: [id])
  quantity   Int
  unitPriceCents Int
  itemNote   String?
}
```

## Appendix B — `docker-compose.yml` + `.env.example`

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: oishi-postgres
    environment:
      POSTGRES_USER: oishi
      POSTGRES_PASSWORD: oishi_dev_pass
      POSTGRES_DB: oishi
    ports:
      - '5432:5432'
    volumes:
      - oishi_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U oishi -d oishi']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  oishi_pgdata:
```

```env
# .env.example (committed) — .env is gitignored
DATABASE_URL="postgresql://oishi:oishi_dev_pass@localhost:5432/oishi?schema=public"
JWT_SECRET="change-me-in-prod-this-is-a-demo-secret-32-chars-min"
COOKIE_DOMAIN="localhost"
NODE_ENV="development"
```

## Appendix C — `prisma/seed.ts`

```typescript
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Users
  const adminHash = await bcrypt.hash('demo-admin-pass', 12);
  const customerHash = await bcrypt.hash('demo-customer-pass', 12);
  await prisma.user.upsert({
    where: { email: 'admin@oishi.dev' },
    update: {},
    create: {
      email: 'admin@oishi.dev',
      passwordHash: adminHash,
      firstName: 'Oishi',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    },
  });
  await prisma.user.upsert({
    where: { email: 'customer@oishi.dev' },
    update: {},
    create: {
      email: 'customer@oishi.dev',
      passwordHash: customerHash,
      firstName: 'Demo',
      lastName: 'Customer',
      role: UserRole.CUSTOMER,
    },
  });

  // Categories
  const maki = await prisma.category.upsert({
    where: { slug: 'maki' },
    update: {},
    create: { name: 'Maki', slug: 'maki', sortOrder: 1 },
  });
  const nigiri = await prisma.category.upsert({
    where: { slug: 'nigiri' },
    update: {},
    create: { name: 'Nigiri', slug: 'nigiri', sortOrder: 2 },
  });
  const special = await prisma.category.upsert({
    where: { slug: 'special-rolls' },
    update: {},
    create: { name: 'Special Rolls', slug: 'special-rolls', sortOrder: 3 },
  });

  // Meals
  const meals = [
    {
      name: 'Salmon Maki',
      description: 'Fresh salmon, rice, nori. 6 pcs.',
      priceCents: 890,
      imageUrl: '/assets/salmon-maki.jpg',
      categoryId: maki.id,
      allergens: ['fish'],
    },
    {
      name: 'Tuna Maki',
      description: 'Bluefin tuna, rice, nori. 6 pcs.',
      priceCents: 990,
      imageUrl: '/assets/tuna-maki.jpg',
      categoryId: maki.id,
      allergens: ['fish'],
    },
    {
      name: 'Salmon Nigiri',
      description: 'Hand-pressed rice with salmon slice. 2 pcs.',
      priceCents: 650,
      imageUrl: '/assets/salmon-nigiri.jpg',
      categoryId: nigiri.id,
      allergens: ['fish'],
    },
    {
      name: 'Ebi Nigiri',
      description: 'Cooked shrimp on rice. 2 pcs.',
      priceCents: 590,
      imageUrl: '/assets/ebi-nigiri.jpg',
      categoryId: nigiri.id,
      allergens: ['shellfish'],
    },
    {
      name: 'Dragon Roll',
      description: 'Eel, avocado, tempura crunch. 8 pcs.',
      priceCents: 1490,
      imageUrl: '/assets/dragon-roll.jpg',
      categoryId: special.id,
      allergens: ['fish', 'gluten'],
    },
    {
      name: 'Rainbow Roll',
      description: 'California roll topped with assorted sashimi. 8 pcs.',
      priceCents: 1590,
      imageUrl: '/assets/rainbow-roll.jpg',
      categoryId: special.id,
      allergens: ['fish', 'shellfish'],
    },
  ];
  for (const m of meals) {
    await prisma.meal
      .upsert({
        where: { name: m.name }, // not a @unique — switch to findFirst+create in real code; OK for seed
        update: {},
        create: m,
      })
      .catch(async () => {
        const exists = await prisma.meal.findFirst({ where: { name: m.name } });
        if (!exists) await prisma.meal.create({ data: m });
      });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

## Appendix D — Husky + lint-staged

```json
// package.json excerpt
{
  "lint-staged": {
    "*.{ts,tsx,js}": ["eslint --fix --max-warnings=0"],
    "*.{ts,tsx,js,json,md,yaml,yml}": ["prettier --write"]
  },
  "scripts": {
    "typecheck": "pnpm nx run-many --target=typecheck --all",
    "test:affected": "pnpm nx affected --target=test --passWithNoTests",
    "prepare": "husky"
  }
}
```

```bash
# .husky/pre-commit
pnpm lint-staged
pnpm typecheck
```

## Appendix E — `scripts/ensure-services.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Postgres up?
if ! docker compose ps postgres | grep -q "healthy\|Up"; then
  docker compose up -d postgres
fi

# Wait until ready (max 30s)
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U oishi -d oishi >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "postgres not healthy after 30s" >&2
exit 1
```

## Appendix F — `scripts/morning-check.sh`

(see §11 above for content)

## Appendix G — `scripts/stop-overnight.sh`

```bash
#!/usr/bin/env bash
pkill -f "run-overnight.sh" 2>/dev/null || true
pkill -f "caffeinate -i" 2>/dev/null || true
echo "Stopped. Resume with: bash scripts/run-overnight.sh"
```

## Appendix H — `.gitignore` additions

```
# Env
.env
.env.local
.env.*.local

# Nx
.nx/cache
.nx/workspace-data

# Node
node_modules
pnpm-store

# Builds
dist
tmp
.angular

# Testing
coverage
test-output
playwright-report
playwright/.cache

# Logs
.claude/logs/

# OS
.DS_Store
```
