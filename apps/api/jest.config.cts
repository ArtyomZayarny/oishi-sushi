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
  // T6 / F4-AC1 (spec §5) — the allergen safety kernel is release-blocking and
  // must keep 100% BRANCH coverage. This threshold fires on any coverage run
  // (`pnpm exec nx test api --coverage`); a drop below 100% on candidates.ts
  // fails the run. Scoped to the one file so it does not force coverage
  // collection (or a global threshold) on the rest of the suite.
  coverageThreshold: {
    'src/sommelier/candidates.ts': {
      branches: 100,
      functions: 100,
      statements: 100,
      lines: 100,
    },
  },
};
