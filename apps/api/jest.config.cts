const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@org/api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
  // The DB-backed supertest suites (orders/admin-orders/menu/auth) and the
  // socket.io gateway suite run real Postgres queries + bcrypt hashing per
  // `it()`. Under CI's `nx affected … --parallel=3` (api tests competing with
  // web tests + two webpack/Angular builds for CPU), those legitimately-slow
  // operations blow past jest's 5 s default per-test timeout — the observed
  // flaky failures (e.g. admin-orders 19 s, gateway "timeout waiting for …").
  // 30 s gives DB + crypto + websocket round-trips ample headroom under CPU
  // starvation. Fast unit suites finish in ms and never approach it, so this
  // never masks a real hang. (The gateway spec's own inner socket timers are
  // raised in lockstep so the outer budget governs.)
  testTimeout: 30000,
  // T6 / F4-AC1 (spec §5) — the allergen safety kernel is release-blocking and
  // must keep 100% BRANCH coverage. This threshold fires on any coverage run
  // (`pnpm exec nx test api --coverage`); a drop below 100% on candidates.ts
  // fails the run. Scoped to the one file so it does not force a global
  // threshold on the rest of the suite.
  //
  // Two settings together make the gate actually fire:
  //   1. `collectCoverageFrom` — with the @swc/jest transform, jest's coverage
  //      provider only instruments files it is explicitly told to collect from.
  //      Without it the coverage map is empty and the threshold below errors
  //      with "Coverage data … was not found".
  //   2. The threshold key is a GLOB (`**/candidates.ts`), not a bare relative
  //      path. Jest resolves a non-glob threshold key against `process.cwd()`,
  //      which under `nx` is the WORKSPACE ROOT (oishi-sushi) — so the literal
  //      key `src/sommelier/candidates.ts` resolved to a path that is not in
  //      the (absolute-keyed) coverage map, again yielding "was not found" and
  //      failing the run for the wrong reason. A `**/`-prefixed glob matches the
  //      absolute map key by suffix regardless of cwd. `collectCoverageFrom`
  //      keeps instrumentation scoped to the one file, so the glob can only
  //      ever match candidates.ts.
  collectCoverageFrom: ['**/sommelier/candidates.ts'],
  coverageThreshold: {
    '**/sommelier/candidates.ts': {
      branches: 100,
      functions: 100,
      statements: 100,
      lines: 100,
    },
  },
};
