import { test, expect } from '@playwright/test';

test('home page renders the marketing hero', async ({ page }) => {
  await page.goto('/');

  expect(await page.locator('h1').innerText()).toContain('Fresh sushi');
});
