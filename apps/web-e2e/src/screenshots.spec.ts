import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ADMIN, CUSTOMER, login, waitForAuthHydrated } from './helpers';

// Opt-in suite — only runs when invoked through scripts/capture-screenshots.sh
// (which sets SCREENSHOT_OUT). Skipping by default keeps `pnpm nx e2e web-e2e`
// fast and side-effect-free.
const SCREENSHOT_OUT = process.env['SCREENSHOT_OUT'];
const OUT_DIR = SCREENSHOT_OUT
  ? resolve(SCREENSHOT_OUT)
  : resolve(__dirname, '../../../docs/screenshots');

test.describe('capture marketing screenshots', () => {
  test.skip(!SCREENSHOT_OUT, 'set SCREENSHOT_OUT to capture');

  test.beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('home', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/home.png`, fullPage: true });
  });

  test('menu', async ({ page }) => {
    await page.goto('/menu');
    await expect(page.locator('[data-meal-card]').first()).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: `${OUT_DIR}/menu.png`, fullPage: true });
  });

  test('cart', async ({ context, page }) => {
    await login(context.request, CUSTOMER);
    await page.goto('/menu');
    await waitForAuthHydrated(page);
    await page
      .locator('[data-meal-card]')
      .first()
      .getByRole('button', { name: 'Add' })
      .click();
    await page
      .locator('[data-meal-card]')
      .nth(1)
      .getByRole('button', { name: 'Add' })
      .click();
    await page.goto('/cart');
    await expect(page.locator('[data-cart-item]').first()).toBeVisible();
    await page.screenshot({ path: `${OUT_DIR}/cart.png`, fullPage: true });
  });

  test('admin meals', async ({ context, page }) => {
    await login(context.request, ADMIN);
    await page.goto('/admin');
    await waitForAuthHydrated(page, true);
    await expect(page.locator('[data-admin-meals]')).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: `${OUT_DIR}/admin-meals.png`,
      fullPage: true,
    });
  });
});
