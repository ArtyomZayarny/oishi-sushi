import { runEval } from './run-eval';

/**
 * T9 — the LIVE eval DRIVER (spec §11 mode (b)). This is the entry the `eval` Nx
 * target runs: `pnpm exec nx run api:eval`.
 *
 * It is a Jest file ON PURPOSE — Jest's `@swc/jest` pipeline is the only
 * transform in this repo that resolves the live graph's three quirks at once
 * (the `@org/shared-types` path alias, that package's ESM `.js`-on-`.ts` barrel
 * specifiers, and Nest's emitted decorator metadata). See `run-eval.ts` header.
 *
 * CRITICAL ISOLATION: this file is named `*.eval.ts`, NOT `*.spec.ts`/`*.test.ts`.
 * The `test` target's jest testMatch is the nx default (the `spec|test` glob),
 * which CANNOT match `*.eval.ts`; only the dedicated `jest.eval.config.cts`
 * (used solely by the `eval` target) matches it. So `nx affected -t test` — and
 * therefore CI — never loads this file or needs a key. `eval-target.spec.ts`
 * asserts that separation structurally.
 *
 * Exit semantics (§11): a failing §11 threshold becomes a failing Jest
 * assertion ⇒ Jest exits non-zero ⇒ the `eval` target fails. A missing key is a
 * clean SKIP (an accidental keyless run must not read as a red gate). Infra
 * aborts (seed drift / model 503) FAIL loudly with the reason.
 */

// Live model calls × ~18 cases (non-streaming Opus 4.8, 5–15 s each) can run for
// minutes — give the whole run a generous ceiling.
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

describe('T9 — live sommelier eval (§11 thresholds)', () => {
  it(
    'meets the §11 thresholds (safety 100% · expected-meal ≥80% · abstain ≥3/4)',
    async () => {
      const outcome = await runEval();

      if (outcome.abort?.reason === 'missing-key') {
        // Opt-in: no key ⇒ skip, do not fail. The report explains why.
        process.stdout.write(`\n[eval skipped] ${outcome.abort.detail}\n`);
        return;
      }

      // Seed drift / failed model call are infrastructure problems, not graded
      // results — surface them as a hard failure with the reason.
      expect(outcome.abort).toBeUndefined();

      const result = outcome.result;
      expect(result).toBeDefined();
      if (!result) return;

      // Release-blocking: safety must be 100% across all four sub-metrics.
      expect(result.safety.pass).toBe(true);
      // Quality gates.
      expect(result.expectedMealQuality.pass).toBe(true);
      expect(result.abstainFlagging.pass).toBe(true);
      // Belt-and-suspenders: the aggregate verdict.
      expect(result.pass).toBe(true);
    },
    RUN_TIMEOUT_MS,
  );
});
