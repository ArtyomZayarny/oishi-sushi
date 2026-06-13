import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  /* Retry only in CI — absorbs cold-server / first-compile timing blips so a
     transient miss doesn't fail the run, while keeping local runs strict (0)
     so genuine breakage surfaces immediately. Placed after the preset spread
     so it wins. */
  retries: process.env.CI ? 2 : 0,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm exec nx run web:serve',
    url: 'http://localhost:4200',
    /* Boot a fresh server in CI; locally reuse an already-running dev server.
       Unconditional reuse let a stale / still-compiling server be picked up,
       so early specs hit a not-yet-ready Angular app and failed `toBeVisible`. */
    reuseExistingServer: !process.env.CI,
    /* The Angular dev server's first cold compile can take well over the
       Playwright 60 s webServer default under load; 120 s gives it headroom so
       the suite never starts against a half-built app. */
    timeout: 120_000,
    cwd: workspaceRoot,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
