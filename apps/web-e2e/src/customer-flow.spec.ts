import { expect, test } from '@playwright/test';

import { CUSTOMER, login, waitForAuthHydrated } from './helpers';

test.describe('customer end-to-end flow', () => {
  test('browses menu, adds first meal, checks out, sees PENDING order', async ({
    context,
    page,
  }) => {
    await login(context.request, CUSTOMER);

    await page.goto('/menu');
    await waitForAuthHydrated(page);

    const firstCard = page.locator('[data-meal-card]').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const mealName = (
      await firstCard.locator('[data-meal-name]').innerText()
    ).trim();
    await firstCard.getByRole('button', { name: 'Add' }).click();

    await page.goto('/cart');
    const cartItem = page.locator('[data-cart-item]').first();
    await expect(cartItem).toBeVisible();
    await expect(cartItem).toContainText(mealName);
    await expect(page.locator('[data-qty]').first()).toHaveText('1');

    await page.goto('/checkout');
    await page.locator('[data-first-name]').fill('Demo');
    await page.locator('[data-last-name]').fill('Customer');
    await page.locator('[data-phone]').fill('+14155552671');
    await page.locator('[data-address]').fill('1 Sushi Lane');
    await page.locator('[data-postal]').fill('94016');

    const submit = page.locator('[data-submit]');
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(/\/orders\/[A-Za-z0-9-]+$/, { timeout: 10_000 });
    const badge = page.locator('[data-badge]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/pending/i);
  });
});
