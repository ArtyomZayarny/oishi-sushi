/**
 * T9 — the LIVE eval orchestration (spec §11 mode (b), §10 T9 / §13). Exposed as
 * {@link runEval} and driven by `run-eval.driver.ts` under the `eval` Nx target:
 * `pnpm exec nx run api:eval`.
 *
 * OPT-IN, requires `ANTHROPIC_API_KEY`, runs LOCALLY pre-release — never in CI
 * (the `eval` target is not in the `test` group; see `eval-target.spec.ts`). It
 * boots the real Nest app context (real `MenuService` + real `SommelierService`
 * with the live Anthropic client), runs every case in `cases.json` against
 * `claude-opus-4-8`, scores with the pure §11 logic in `scoring.ts`, prints a
 * release-PR-ready report (date · model id · per-category pass counts), and
 * returns a {@link ThresholdResult} whose `.pass` drives the runner's exit code.
 *
 * WHY A JEST-CONFIG TARGET (not a bare `ts-node`/`tsx` script): the live graph
 * pulls in `@org/shared-types`, an ESM package whose barrel uses `.js` import
 * specifiers on `.ts` sources, plus Nest providers that rely on emitted decorator
 * metadata. Only the project's configured transform (the `@swc/jest` pipeline the
 * unit suite already uses) resolves all three — alias + ESM `.js` specifiers +
 * `decoratorMetadata`. The driver therefore runs under that exact pipeline via a
 * DEDICATED jest config whose `testMatch` is `*.eval.ts` (the `test` target's
 * default `*.spec.ts` cannot pick it up), keeping the live, key-requiring run
 * fully outside `nx affected -t test`.
 *
 * Fails fast (before any model call) if the key is missing, or if any
 * `expectMealNames` does not resolve against the live menu (a seed drift would
 * otherwise masquerade as a 0% quality model failure).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { SommelierAskResponse } from '@org/shared-types';
import { AppModule } from '../app/app.module';
import { MenuService } from '../menu/menu.service';
import { sommelierConfig } from '../sommelier/sommelier.config';
import { SommelierService } from '../sommelier/sommelier.service';
import type { SommelierAskDto } from '../sommelier/dto/sommelier-ask.dto';
import type { EvalCase } from './case.types';
import { EVAL_INTENTS } from './case.types';
import { resolveContext, unresolvedExpectedNames } from './resolve-context';
import {
  evaluateThresholds,
  ratioValue,
  scoreCase,
  type CaseScore,
  type ThresholdResult,
} from './scoring';

/** Why a run could not be scored (distinct from a scored-but-failing run). */
export type EvalAbortReason =
  | 'missing-key'
  | 'seed-drift'
  | 'model-call-failed';

export interface EvalRunOutcome {
  /** Present when the run completed and was scored. */
  result?: ThresholdResult;
  /** Present when the run could not be scored at all. */
  abort?: { reason: EvalAbortReason; detail: string };
}

export function loadCases(): EvalCase[] {
  return JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8'));
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Render the release-PR report (date · model id · per-category counts). */
export function formatReport(
  result: ThresholdResult,
  scores: CaseScore[],
  modelId: string,
): string {
  const line = '─'.repeat(60);
  const out: string[] = [];
  out.push(line, 'SUSHI SOMMELIER — LIVE EVAL (§11)', line);
  out.push(`date:     ${new Date().toISOString()}`);
  out.push(`model:    ${modelId}`);
  out.push(`cases:    ${scores.length}`);
  out.push(line, 'SAFETY (each must be 100% — RELEASE-BLOCKING):');
  const s = result.safety;
  for (const [label, r] of [
    ['allergen exclusion ', s.allergenExclusion],
    ['on-menu-only       ', s.onMenuOnly],
    ['abstain-has-no-recs', s.abstainHasNoRecs],
    ['no fabricated offer', s.noFabricatedOffers],
  ] as const) {
    const ok = ratioValue(r) === 1 ? 'PASS' : 'FAIL';
    out.push(
      `  ${label}: ${r.passed}/${r.total} (${pct(ratioValue(r))}) ${ok}`,
    );
  }
  out.push(`  => safety ${s.pass ? 'PASS' : 'FAIL'}`, line);

  const q = result.expectedMealQuality;
  out.push(
    `EXPECTED-MEAL QUALITY: ${q.ratio.passed}/${q.ratio.total} (${pct(
      ratioValue(q.ratio),
    )}) >= ${pct(q.threshold)} ${q.pass ? 'PASS' : 'FAIL'}`,
  );
  const a = result.abstainFlagging;
  out.push(
    `ABSTAIN FLAGGING:      ${a.ratio.passed}/${a.ratio.total} (${pct(
      ratioValue(a.ratio),
    )}) >= ${pct(a.threshold)} ${a.pass ? 'PASS' : 'FAIL'}`,
    line,
    'PER-CATEGORY (for the release PR):',
  );
  for (const intent of EVAL_INTENTS) {
    const c = result.perCategory[intent];
    if (c.total === 0) continue;
    const quality = c.qualityApplies
      ? `  quality ${c.qualityPass}/${c.total}`
      : '';
    out.push(
      `  ${intent.padEnd(11)} n=${c.total}  safety ${c.safetyPass}/${c.total}${quality}`,
    );
  }
  out.push(line);

  const failures = scores.filter(
    (sc) =>
      !sc.allergenSafe ||
      !sc.onMenuOnly ||
      !sc.abstainHasNoRecs ||
      !sc.noFabricatedOffer ||
      sc.expectedMealHit === false ||
      sc.newestHit === false ||
      sc.abstainFlagged === false,
  );
  if (failures.length > 0) {
    out.push('FAILING CASES:');
    for (const f of failures) {
      const flags: string[] = [];
      if (!f.allergenSafe) flags.push('allergen');
      if (!f.onMenuOnly) flags.push('on-menu');
      if (!f.abstainHasNoRecs) flags.push('abstain-has-recs');
      if (!f.noFabricatedOffer) flags.push('fabricated-offer');
      if (f.expectedMealHit === false) flags.push('expected-meal-miss');
      if (f.newestHit === false) flags.push('newest-miss');
      if (f.abstainFlagged === false) flags.push('not-flagged-abstain');
      out.push(`  [${f.intent}] ${f.id}: ${flags.join(', ')}`);
    }
    out.push(line);
  }

  out.push(`OVERALL: ${result.pass ? 'PASS' : 'FAIL'}`, line);
  return out.join('\n');
}

/**
 * Boot the real DI graph, run every case against the live model, and score.
 * Returns either a scored {@link ThresholdResult} or an `abort` (missing key,
 * seed drift, or a failed model call — none of which should score as a pass).
 */
export async function runEval(): Promise<EvalRunOutcome> {
  const logger = new Logger('eval');
  const cases = loadCases();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const cfg = app.get<ConfigType<typeof sommelierConfig>>(
      sommelierConfig.KEY,
    );
    if (!cfg.hasAnthropicKey) {
      return {
        abort: {
          reason: 'missing-key',
          detail:
            'ANTHROPIC_API_KEY is not set — the live eval needs a funded key. ' +
            'Set it and re-run `nx run api:eval`. (CI never runs this target.)',
        },
      };
    }

    const menu = app.get(MenuService, { strict: false });
    const sommelier = app.get(SommelierService, { strict: false });
    const snapshot = await menu.listPublic();

    const missing = unresolvedExpectedNames(snapshot, cases);
    if (missing.length > 0) {
      return {
        abort: {
          reason: 'seed-drift',
          detail: `These expectMealNames do not resolve against the live menu (seed drift?): ${missing.join(
            ', ',
          )}. Fix cases.json or re-seed before running the eval.`,
        },
      };
    }

    logger.log(`Running ${cases.length} cases against ${cfg.model}...`);
    const scores: CaseScore[] = [];
    for (const evalCase of cases) {
      const dto = {
        query: evalCase.query,
        avoidAllergens: evalCase.avoidAllergens,
      } as SommelierAskDto;
      let response: SommelierAskResponse;
      try {
        response = await sommelier.ask(dto);
      } catch (err) {
        return {
          abort: {
            reason: 'model-call-failed',
            detail: `Case ${evalCase.id} threw (${
              err instanceof Error ? err.constructor.name : typeof err
            }) — re-run once the model call succeeds (a 503 is infra, not a graded result).`,
          },
        };
      }
      scores.push(
        scoreCase(evalCase, response, resolveContext(snapshot, evalCase)),
      );
    }

    const result = evaluateThresholds(scores);
    // The report IS the deliverable stdout (pasted into the release PR).
    process.stdout.write('\n' + formatReport(result, scores, cfg.model) + '\n');
    return { result };
  } finally {
    await app.close();
  }
}
