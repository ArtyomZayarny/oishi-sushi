const { readFileSync } = require('fs');

// Reuse the SAME SWC compile config the unit suite uses — it is the only
// transform that resolves the live graph's @org/shared-types alias + that
// package's ESM `.js`-on-`.ts` barrel + Nest decorator metadata together.
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);
swcJestConfig.swcrc = false;

/**
 * T9 — DEDICATED jest config for the LIVE eval (`nx run api:eval` → this config).
 * It is NOT the `test` target's config. Two deliberate differences from
 * `jest.config.cts`:
 *   1. `testMatch` targets ONLY `*.eval.ts` — the `test` target's default
 *      `*.spec.ts`/`*.test.ts` pattern cannot match these, so `nx affected -t
 *      test` (and CI) never load the key-requiring driver.
 *   2. NO `coverageThreshold` — the live run is not a coverage run; the
 *      candidates.ts 100%-branch gate stays on the `test` config only.
 */
module.exports = {
  displayName: '@org/api:eval',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // Only the live eval driver(s). Excludes every `*.spec.ts` by construction.
  testMatch: ['<rootDir>/src/**/*.eval.ts'],
};
