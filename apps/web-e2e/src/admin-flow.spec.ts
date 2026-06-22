import { expect, test } from '@playwright/test';

import {
  ADMIN,
  CUSTOMER,
  deleteMealByName,
  login,
  waitForAuthHydrated,
} from './helpers';

// Unique per run. `Meal.name` is a GLOBAL `@unique` (prisma/schema.prisma) that
// ignores `deletedAt`, and the admin DELETE endpoint only SOFT-deletes
// (menu.service.softDelete sets deletedAt, the row + its name persist). A fixed
// name therefore 409s on the second local run. A per-run suffix sidesteps the
// collision entirely — correctness no longer depends on cleanup running, and it
// needs no backend hard-delete endpoint or direct DB access from the spec.
const TEST_MEAL_NAME = `Test Roll ${Date.now()}`;

test.describe('admin end-to-end flow', () => {
  // Best-effort tidy-up so soft-deleted rows don't accumulate across runs. Not
  // load-bearing for correctness (the unique suffix above guarantees no clash);
  // kept so a long sequence of local runs doesn't leave a trail of dead rows.
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
    const firstCategoryOption = categorySelect
      .locator('option:not([disabled])')
      .first();
    // Web-first (auto-retrying) assertion that the first enabled option carries
    // a non-empty value, replacing the former `getAttribute()` + `toBeTruthy()`
    // pair (playwright/prefer-web-first-assertions). The value is then read
    // purely to drive selectOption — no longer an assertion target, and the
    // assertion above guarantees it is non-empty, so no `?? ''` fallback
    // (and thus no playwright/no-conditional-in-test) is needed.
    await expect(firstCategoryOption).toHaveAttribute('value', /.+/);
    const firstCategoryValue = await firstCategoryOption.getAttribute('value');
    await categorySelect.selectOption(firstCategoryValue as string);

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
