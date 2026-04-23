import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const ADMIN = {
  email: 'admin@oishi.dev',
  password: 'demo-admin-pass',
} as const;

export const CUSTOMER = {
  email: 'customer@oishi.dev',
  password: 'demo-customer-pass',
} as const;

export interface PublicMeal {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  meals: PublicMeal[];
}

export async function login(
  request: APIRequestContext,
  who: { email: string; password: string },
): Promise<void> {
  const res = await request.post('/api/auth/login', { data: who });
  expect(res.ok(), `login ${who.email} → ${res.status()}`).toBe(true);
}

export async function fetchMenu(
  request: APIRequestContext,
): Promise<PublicCategory[]> {
  const res = await request.get('/api/menu');
  expect(res.ok(), `menu fetch → ${res.status()}`).toBe(true);
  return (await res.json()) as PublicCategory[];
}

export async function createOrder(
  request: APIRequestContext,
  meal: PublicMeal,
): Promise<{ id: string; userId: string }> {
  const subtotalCents = meal.priceCents;
  const taxCents = Math.round(subtotalCents * 0.15);
  const res = await request.post('/api/orders', {
    data: {
      items: [{ mealId: meal.id, quantity: 1 }],
      subtotalCents,
      taxCents,
      tipCents: 0,
      totalCents: subtotalCents + taxCents,
      deliveryAddress: '1 Test St',
      deliveryPostal: '12345',
      phone: '+14155552671',
    },
  });
  expect(res.ok(), `create order → ${res.status()}`).toBe(true);
  return (await res.json()) as { id: string; userId: string };
}

export async function patchOrderStatus(
  request: APIRequestContext,
  orderId: string,
  status: string,
): Promise<void> {
  const res = await request.patch(`/api/admin/orders/${orderId}`, {
    data: { status },
  });
  expect(res.ok(), `patch status → ${res.status()}`).toBe(true);
}

export async function deleteMealByName(
  request: APIRequestContext,
  name: string,
): Promise<void> {
  const res = await request.get('/api/admin/menu');
  if (!res.ok()) return;
  const meals = (await res.json()) as { id: string; name: string }[];
  const target = meals.find((m) => m.name === name);
  if (!target) return;
  await request.delete(`/api/admin/menu/${target.id}`);
}

export async function waitForAuthHydrated(
  page: Page,
  expectAdmin = false,
): Promise<void> {
  await expect(page.locator('a[href="/auth/login"]')).toHaveCount(0, {
    timeout: 10_000,
  });
  if (expectAdmin) {
    await expect(page.locator('a[href="/admin"]')).toBeVisible({
      timeout: 10_000,
    });
  }
}

export async function authenticatedContext(
  context: BrowserContext,
  who: { email: string; password: string },
): Promise<void> {
  await login(context.request, who);
}
