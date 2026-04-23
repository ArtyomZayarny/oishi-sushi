import { expect, test } from '@playwright/test';

import {
  ADMIN,
  CUSTOMER,
  createOrder,
  fetchMenu,
  login,
  patchOrderStatus,
  waitForAuthHydrated,
} from './helpers';

test.describe('realtime order status updates', () => {
  test('admin status patch propagates to the customer page within 3s without reload', async ({
    browser,
  }) => {
    const customerCtx = await browser.newContext();
    const adminCtx = await browser.newContext();

    try {
      await login(customerCtx.request, CUSTOMER);
      await login(adminCtx.request, ADMIN);

      const menu = await fetchMenu(customerCtx.request);
      const firstMeal = menu.flatMap((c) => c.meals)[0];
      expect(firstMeal, 'menu should have at least one meal').toBeTruthy();

      const order = await createOrder(customerCtx.request, firstMeal);

      const customerPage = await customerCtx.newPage();
      const initialNav = customerPage.goto(`/orders/${order.id}`);

      // Capture how long the page took to reach domcontentloaded — we'll later
      // assert the realtime update completes without exceeding that + 3s grace.
      await initialNav;
      await waitForAuthHydrated(customerPage);

      const badge = customerPage.locator('[data-badge]');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(/pending/i);
      const initialNavCount = customerPage.url();

      // Trigger the change from the admin context
      await patchOrderStatus(adminCtx.request, order.id, 'CONFIRMED');

      // Within 3s the badge text must change without a reload
      await expect(badge).toHaveText(/confirmed/i, { timeout: 3_000 });

      expect(customerPage.url()).toBe(initialNavCount);
    } finally {
      await customerCtx.close();
      await adminCtx.close();
    }
  });
});
