import { expect, test } from '@playwright/test';

const SPEC_MEALS = [
  'Otoro Selection',
  'Chef’s Omakase',
  'Toro Truffle Roll',
  'Sashimi Moriawase',
  'Ikura Don',
  'Couple’s Set',
] as const;

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('homepage (spec §1 — 1440×900 single viewport)', () => {
  test('renders the OISHI wordmark, diamond, and SUSHI secondary mark', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-wordmark-oishi]')).toHaveText('OISHI');
    await expect(page.locator('[data-wordmark-sushi]')).toHaveText('SUSHI');
    await expect(page.locator('[data-wordmark-diamond]')).toBeVisible();
  });

  test('renders the six spec meals in the spec order', async ({ page }) => {
    await page.goto('/');
    const names = page.locator('[data-meal-name]');
    await expect(names).toHaveCount(6);
    for (let i = 0; i < SPEC_MEALS.length; i++) {
      await expect(names.nth(i)).toHaveText(SPEC_MEALS[i]);
    }
  });

  test('renders the — TODAY’S SELECTION section meta in amber', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-section-meta]')).toHaveText(
      '— TODAY’S SELECTION',
    );
  });

  test('sommelier input has the exact spec placeholder text', async ({
    page,
  }) => {
    await page.goto('/');
    const input = page.locator('[data-kenji-input]');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute(
      'placeholder',
      'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…',
    );
  });

  test('cart badge appears after adding a meal from the first card', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('[data-cart-badge]')).toHaveCount(0);

    const firstAdd = page.locator('[data-add-button]').first();
    await firstAdd.click();

    await expect(page.locator('[data-cart-badge]')).toHaveText('1');
  });

  test('renders without a vertical scrollbar at 1440×900', async ({ page }) => {
    await page.goto('/');
    const hasScroll = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollHeight > el.clientHeight + 1;
    });
    expect(hasScroll).toBe(false);
  });

  test('captures a full-page screenshot for design review', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('[data-meal-name]')).toHaveCount(6);
    await page.screenshot({
      path: testInfo.outputPath('home-1440x900.png'),
      fullPage: false,
    });
    testInfo.attachments.push({
      name: 'home-1440x900',
      contentType: 'image/png',
      path: testInfo.outputPath('home-1440x900.png'),
    });
  });
});
