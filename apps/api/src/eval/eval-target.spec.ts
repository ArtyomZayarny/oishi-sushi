import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T9 — the COMMITTED CI ASSERTION (spec §10 T9 row, §12 DoD): proves the live
 * `eval` target can NEVER be picked up by `nx affected -t test`, and that CI
 * never needs `ANTHROPIC_API_KEY`. This is the unit-check variant the ticket
 * allows ("a committed CI assertion … a unit check via `nx show project api
 * --json`"). It runs inside `nx test api` (no key, no DB).
 *
 * Why this matters: the live eval calls the real `claude-opus-4-8` and needs a
 * funded key. CI has none and never will. The ONLY thing keeping a costly,
 * key-requiring model run out of CI is that `eval` is its own Nx target, NOT in
 * the `test` group and not depended on by `test`. If someone later renames it to
 * `test:eval`, folds it under `test`, or makes `test` depend on it, THIS test
 * fails — loudly, in the very CI run that would otherwise start paying for model
 * calls.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

interface NxTarget {
  executor?: string;
  dependsOn?: unknown;
  cache?: boolean;
  options?: { command?: string };
}

function apiPackageJson(): {
  nx: { targets: Record<string, NxTarget> };
} {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, 'apps', 'api', 'package.json'), 'utf8'),
  );
}

describe('T9 — eval target isolation (CI cannot run the live eval)', () => {
  const targets = apiPackageJson().nx.targets;

  it('an `eval` target exists on apps/api', () => {
    expect(targets.eval).toBeDefined();
  });

  it('`eval` is NOT the `test` target and uses a different executor', () => {
    // test = @nx/jest:jest (jest.config.cts, default *.spec.ts testMatch);
    // eval = nx:run-commands (a dedicated jest.eval.config.cts, *.eval.ts only).
    // `nx affected -t test` only ever runs the `test` target, so the run-commands
    // `eval` — and the *.eval.ts driver it loads — is unreachable by it.
    expect(targets.test?.executor).toBe('@nx/jest:jest');
    expect(targets.eval?.executor).toBe('nx:run-commands');
    expect(targets.eval?.executor).not.toBe(targets.test?.executor);
  });

  it('the `test` target does not depend on `eval` (no transitive pull-in)', () => {
    const dep = targets.test?.dependsOn;
    const deps = Array.isArray(dep) ? dep.map(String) : [];
    expect(deps.some((d) => d.includes('eval'))).toBe(false);
  });

  it('the `eval` target does not depend on `test` and is not cached', () => {
    const dep = targets.eval?.dependsOn;
    const deps = Array.isArray(dep) ? dep.map(String) : [];
    expect(deps.some((d) => d.includes('test'))).toBe(false);
    // A live, side-effecting model run must never be cached.
    expect(targets.eval?.cache).toBe(false);
  });

  it('the `eval` command runs the dedicated eval jest config, never the test config', () => {
    const cmd = targets.eval?.options?.command ?? '';
    expect(cmd).toContain('jest.eval.config.cts');
    // It must NOT run the unit-suite config (that one carries the *.spec.ts
    // testMatch + the candidates.ts coverage gate).
    expect(cmd).not.toContain('jest.config.cts');
  });

  it('the dedicated eval jest config matches ONLY *.eval.ts (never *.spec.ts)', () => {
    // The whole isolation rests on this: the live driver is `*.eval.ts`, and the
    // ONLY config that matches it is jest.eval.config.cts (the `eval` target).
    // The `test` target's jest config uses the nx-default *.spec/*.test pattern,
    // which cannot match *.eval.ts — so `nx test api` never loads the driver.
    const evalCfg = require(
      join(REPO_ROOT, 'apps', 'api', 'jest.eval.config.cts'),
    ) as { testMatch?: string[] };
    const testMatch: string[] = evalCfg.testMatch ?? [];
    expect(testMatch.some((p) => p.includes('*.eval.ts'))).toBe(true);
    expect(testMatch.some((p) => p.includes('spec'))).toBe(false);
  });
});

describe('T9 — CI never needs ANTHROPIC_API_KEY', () => {
  const ciYml = readFileSync(
    join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );

  it('the CI workflow never sets ANTHROPIC_API_KEY', () => {
    expect(ciYml).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it('CI runs affected -t test (and lint/build) but never the eval target', () => {
    // The build/test/lint line: `nx affected -t lint test build`.
    expect(ciYml).toMatch(/nx affected -t lint test build/);
    // No CI step invokes the eval target by any spelling.
    expect(ciYml).not.toMatch(/api:eval/);
    expect(ciYml).not.toMatch(/-t\s+eval\b/);
    // `eval` must not appear in any `nx affected -t …` / `nx run-many -t …` list.
    const targetLists = ciYml.match(/-t\s+[a-z0-9 _-]+/gi) ?? [];
    for (const list of targetLists) {
      expect(list.split(/\s+/)).not.toContain('eval');
    }
  });
});
