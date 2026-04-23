You are one iteration of the overnight autonomous builder for `oishi-sushi` — an Angular 21 + NestJS portfolio app. The user is asleep. Do ONE phase, commit, update STATE.md, exit.

## STOP CONDITIONS (check first, in order)

1. If `STATE.md` frontmatter has `phase: DONE` → print `LOOP COMPLETE` and exit.
2. If `NEEDS_HUMAN.md` exists → print `NEEDS HUMAN` and exit.
3. If `STATE.md.blockers` has ≥2 entries whose `error` field contains the same substring → write `NEEDS_HUMAN.md` (include full STATE.md and last 80 lines of the most recent `.claude/logs/iter-*.log`), exit.

## ENVIRONMENT

Run this preamble in every shell call:

```
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
export NX_IGNORE_UNSUPPORTED_TS_SETUP=true
```

Services script: `./scripts/ensure-services.sh` — idempotent, brings up postgres if not running. Call this at the start of any phase that needs DB.

## PROCESS

1. Read `STATE.md`; determine current phase ID.
2. Open `docs/_playbook/_overnight-plan.md`, find the phase spec in §10 ("Phase specs") by ID.
3. If the working tree is dirty (uncommitted changes from a crashed prior iteration): create a recovery branch `recovery/iter-<timestamp>`, commit WIP to it with message `wip(recovery): from prior iteration`, then `git checkout main && git reset --hard origin/main` (pull if needed).
4. For TDD phases (those in the plan spec listed as "TDD, 2 commits"):
   - Write failing tests. Run them to confirm red. Commit: `test(<phase>): <one-line>`.
   - Implement. Run tests again to confirm green. Commit: `feat(<phase>): <one-line>`.
   - Max 3 implementation attempts in this iteration. If still red after 3, go to step 8 (red exit).
5. For doc phases: fill the relevant docs per the spec. One commit: `docs(<phase>): <one-line>`.
6. Run the phase's `verify` command from the spec.
7. On green:
   - `git push origin main`
   - Update `STATE.md` frontmatter: `phase: <next>`, `iteration: <+1>`, `last_commit: <HEAD sha>`, `last_updated: <ISO timestamp>`, `attempts_on_current_phase: 0`, `blockers: []`.
   - Commit the STATE.md update: `chore(state): advance to <next>`.
   - Push again.
   - Print `PHASE <id> COMPLETE → next: <next>`.
   - Exit 0.
8. On red after 3 attempts:
   - Append to `STATE.md.blockers`: `{iter: <iter>, error: "<err>"}`.
   - Increment `attempts_on_current_phase`.
   - Commit WIP to branch `wip/<phase>-iter-<iter>` (NOT main).
   - Print `PHASE <id> FAILED`.
   - Exit 1.

## HARD RULES

- Never `git push --force`.
- Never `git reset --hard` without a prior recovery-branch commit (step 3).
- Never commit `.env`, `.env.*` (except `.env.example`), credentials, or secrets.
- Never delete files from earlier phases. To supersede a decision, add a new ADR (`0008-*`, `0009-*`).
- For TDD phases: MUST produce exactly 2 commits on main (test → impl). Verify before exiting: `git log -2 --format=%s origin/main..HEAD` matches `^(test|feat)\(<phase>\)`.
- Before exit with success: `git status --porcelain` must be empty.
- For CLI prompts (y/n): use `yes y |` or flag. Never hang waiting for input.
- If any command runs >120s with no new output, kill it and try a different approach.
- Keep commits small and focused. One phase = 1-2 commits on main, as the spec dictates.
- Respect Prisma 7 semantics: the `PrismaClient` constructor needs an adapter (see `apps/api/src/prisma/prisma.service.ts` — use that service, don't instantiate PrismaClient raw).

## HOUSEKEEPING

- After commit: delete any `*.log` files, `.nx/workspace-data/`, `/tmp/oishi-*` backup dirs you created.
- If Nx complains about sync: `pnpm exec nx sync` then retry.
- If the migration count differs from the schema: `pnpm prisma migrate dev` to create a new migration.

Begin.
