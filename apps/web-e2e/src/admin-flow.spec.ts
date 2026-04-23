import { expect, test } from '@playwright/test';

import {
  ADMIN,
  CUSTOMER,
  deleteMealByName,
  login,
  waitForAuthHydrated,
} from './helpers';

const TEST_MEAL_NAME = 'Test Roll';

test.describe('admin end-to-end flow', () => {
  test.beforeEach(async ({ request }) => {
    await login(request, ADMIN);
    await deleteMealByName(request, TEST_MEAL_NAME);
  });

  test.afterEach(async ({ request }) => {
    await login(request, ADMIN);
    await deleteMealByName(request, TEST_MEAL_NAME);
  });

  test('admin creates a new meal that appears on the public menu', async ({
    context,
    page,
  }) => {
    await login(context.request, ADMIN);

    await page.goto('/admin');
    await waitForAuthHydrated(page, true);
    await expect(page.locator('[data-admin-meals]')).toBeVisible({
      timeout: 10_000,
    });

    await page.locator('[data-new-meal]').click();
    await expect(page.locator('[data-editor]')).toBeVisible();

    await page.locator('[data-name]').fill(TEST_MEAL_NAME);
    await page
      .locator('[data-description]')
      .fill('Crispy tempura crunch with avocado.');
    await page.locator('[data-price]').fill('1299');
    await page.locator('[data-image-url]').fill('/assets/meals/test-roll.jpg');

    const categorySelect = page.locator('[data-category]');
    await expect(categorySelect.locator('option').nth(1)).toBeAttached({
      timeout: 10_000,
    });
    const firstCategoryValue = await categorySelect
      .locator('option:not([disabled])')
      .first()
      .getAttribute('value');
    expect(firstCategoryValue).toBeTruthy();
    await categorySelect.selectOption(firstCategoryValue ?? '');

    const save = page.locator('[data-editor-save]');
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.locator('[data-editor]')).toHaveCount(0, {
      timeout: 10_000,
    });
    await expect(
      page.locator(`[data-meal-row]:has-text("${TEST_MEAL_NAME}")`),
    ).toBeVisible({ timeout: 10_000 });

    await context.clearCookies();
    await login(context.request, CUSTOMER);
    await page.goto('/menu');
    await waitForAuthHydrated(page);
    await expect(
      page.locator(`[data-meal-name]:has-text("${TEST_MEAL_NAME}")`).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
