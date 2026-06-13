import type { Page, Route } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * T13 — Sommelier E2E (route-intercepted; no real LLM/api/DB).
 *
 * Both `/api/menu` and `/api/sommelier` are mocked so the suite is fully
 * self-contained and runs against `web:serve-static` (the built SPA, no
 * backend). Covers F7-AC4 (happy path, both variants), abstain, error +
 * delayed-503 (§7.5), and F8-AC2 (cart badge increment).
 *
 * The SSR post-build smoke (F7-AC5) is NOT here — it needs the real api+DB
 * (serve-ssr proxies /api/menu) and lives in scripts/ssr-smoke.mjs.
 */

const PLACEHOLDER =
  'Ask Kenji — what’s freshest, what pairs with sake, what should I try first…';

// The home grid renders exactly these six meals (by name) — see DISPLAY_ORDER
// in home.component.ts. Allergens here also feed the select-only chips.
const MENU_FIXTURE = [
  {
    id: 'c1',
    name: 'Maki',
    slug: 'maki',
    sortOrder: 1,
    meals: [
      meal('m-truffle', 'Toro Truffle Roll', 3800, ['Fish', 'Soy']),
      meal(
        'm-spicytuna',
        'Spicy Tuna Roll',
        1290,
        ['Fish', 'Soy'],
        '/img/str.jpg',
      ),
    ],
  },
  {
    id: 'c2',
    name: 'Nigiri',
    slug: 'nigiri',
    sortOrder: 2,
    meals: [meal('m-otoro', 'Otoro Selection', 4800, ['Fish'])],
  },
  {
    id: 'c3',
    name: 'Omakase',
    slug: 'omakase',
    sortOrder: 3,
    meals: [meal('m-omakase', 'Chef’s Omakase', 12000, ['Fish', 'Shellfish'])],
  },
  {
    id: 'c4',
    name: 'Sashimi',
    slug: 'sashimi',
    sortOrder: 4,
    meals: [meal('m-sashimi', 'Sashimi Moriawase', 5200, ['Fish'])],
  },
  {
    id: 'c5',
    name: 'Donburi',
    slug: 'donburi',
    sortOrder: 5,
    meals: [meal('m-ikura', 'Ikura Don', 3200, ['Fish', 'Soy'])],
  },
  {
    id: 'c6',
    name: 'Sets',
    slug: 'sets',
    sortOrder: 6,
    meals: [meal('m-couples', 'Couple’s Set', 12800, ['Fish', 'Gluten'])],
  },
];

function meal(
  id: string,
  name: string,
  priceCents: number,
  allergens: string[],
  imageUrl: string | null = null,
) {
  return {
    id,
    name,
    description: `${name} — chef’s description.`,
    priceCents,
    imageUrl,
    active: true,
    deletedAt: null,
    categoryId: 'c',
    allergens,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    options: [],
  };
}

const ANSWER_RESPONSE = {
  answer: 'For spicy tuna, the Spicy Tuna Roll [1] is your best bet [2].',
  recommendations: [
    {
      mealId: 'm-spicytuna',
      name: 'Spicy Tuna Roll',
      priceCents: 1290,
      imageUrl: '/img/str.jpg',
      why: 'Sriracha-marinated tuna — the spiciest tuna roll on the menu.',
    },
    {
      mealId: 'm-otoro',
      name: 'Otoro Selection',
      priceCents: 4800,
      imageUrl: null,
      why: 'Rich bluefin belly to balance the heat.',
    },
  ],
  sources: [
    { type: 'menu', ref: 'm-spicytuna' },
    { type: 'kb', ref: 'taste-guide', section: 'spice' },
  ],
  confidence: 'high',
  requestId: 'req_e2e_1',
};

const ABSTAIN_RESPONSE = {
  answer: "We don't serve pizza — we're a sushi shop. Browse the menu instead.",
  recommendations: [],
  sources: [],
  confidence: 'abstain',
  requestId: 'req_e2e_2',
};

const UNAVAILABLE_503 = {
  statusCode: 503,
  error: 'SOMMELIER_UNAVAILABLE',
  message: 'The sommelier is temporarily unavailable. Please try again.',
};

/** Mock /api/menu so the home page renders the 6-meal grid + allergen vocab. */
async function mockMenu(page: Page): Promise<void> {
  await page.route('**/api/menu', (route: Route) =>
    route.fulfill({ json: MENU_FIXTURE }),
  );
}

/** Mock POST /api/sommelier with a JSON body, optional delay (ms). */
async function mockSommelier(
  page: Page,
  body: unknown,
  opts: { status?: number; delayMs?: number } = {},
): Promise<void> {
  await page.route('**/api/sommelier', async (route: Route) => {
    if (opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    await route.fulfill({ status: opts.status ?? 200, json: body });
  });
}

/**
 * Submit a query to Kenji, hydration-safe.
 *
 * The send button is `type="submit"` inside `<form (ngSubmit)>`
 * (sommelier-input.component.ts). If a click lands in the brief window before
 * Angular's submit listener is active, the browser performs a NATIVE form
 * submission — a GET that navigates the page to `/?`, wiping the SPA and the
 * route mocks, so the answer panel never appears. That navigation is the root
 * of the intermittent "[data-panel-loading]/[data-sommelier-panel] not found"
 * failures.
 *
 * Rather than gate on a fragile framework hydration marker (SSG keeps
 * `ng-server-context`; `ngh` is consumed before `goto` resolves), make the
 * interaction self-correcting: fill + click, then assert the hydrated handler
 * caught it — the panel opened (loading or answer) and we did NOT navigate away
 * from the home path. `expect(...).toPass()` retries the whole block, so a
 * stray native submit that bounces to `/?` simply triggers another attempt
 * until hydration wins. Deterministic and lint-clean. `root` scopes the
 * input/button (the mobile dock passes its own).
 */
async function ask(
  page: Page,
  query: string,
  root: Page | ReturnType<Page['locator']> = page,
): Promise<void> {
  await expect(async () => {
    // A prior attempt's stray native submit may have navigated to `/?`; bring
    // the page back so the retry starts from a clean home render.
    if (new URL(page.url()).search !== '') {
      await page.goto('/');
    }
    await root.locator('[data-kenji-input]').fill(query);
    await root.locator('[data-send-button]').click();
    // Proof the hydrated (ngSubmit) handler ran: the panel exists and the
    // native GET did NOT navigate (search string stays empty).
    await expect(page.locator('[data-sommelier-panel]')).toBeAttached({
      timeout: 2000,
    });
    expect(new URL(page.url()).search).toBe('');
  }).toPass({ timeout: 20_000 });
}

// ───────────────────────────── Desktop (full) ─────────────────────────────

test.describe('T13 / F7-AC4 — happy path, DESKTOP full variant', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('type → submit → loading → answer panel with exactly N cards', async ({
    page,
  }) => {
    await mockMenu(page);
    await mockSommelier(page, ANSWER_RESPONSE, { delayMs: 400 });
    await page.goto('/');

    // The desktop layout renders the Band-3 sommelier (no mobile dock).
    await expect(page.locator('[data-sommelier-dock]')).toHaveCount(0);
    await expect(page.locator('[data-kenji-input]')).toHaveAttribute(
      'placeholder',
      PLACEHOLDER,
    );

    await ask(page, 'something spicy with tuna');

    // Loading state opens immediately.
    await expect(page.locator('[data-panel-loading]')).toBeVisible();
    await expect(page.locator('[data-panel-loading]')).toContainText(
      'KENJI IS THINKING',
    );

    // Answer panel + exactly recommendations.length cards.
    const panel = page.locator('[data-sommelier-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-answer-text]')).toContainText(
      'Spicy Tuna Roll [1]',
    );
    await expect(page.locator('[data-rec-card]')).toHaveCount(2);
    await expect(
      page.locator('[data-rec-card] [data-rec-name]').first(),
    ).toHaveText('Spicy Tuna Roll');
    await expect(
      page.locator('[data-rec-card] [data-rec-price]').first(),
    ).toContainText('$12.90');
  });

  test('the ✕ close button dismisses the panel', async ({ page }) => {
    await mockMenu(page);
    await mockSommelier(page, ANSWER_RESPONSE);
    await page.goto('/');
    await ask(page, 'spicy tuna');
    await expect(page.locator('[data-sommelier-panel]')).toBeVisible();
    await page.locator('[data-panel-close]').click();
    await expect(page.locator('[data-sommelier-panel]')).toHaveCount(0);
  });
});

// ───────────────────────────── Mobile (compact) ───────────────────────────

test.describe('T13 / F7-AC4 — happy path, MOBILE compact dock', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('dock submit → loading → answer panel with cards (same panel, compact)', async ({
    page,
  }) => {
    await mockMenu(page);
    await mockSommelier(page, ANSWER_RESPONSE, { delayMs: 300 });
    await page.goto('/');

    // Mobile layout renders the dock; the Band-3 desktop canvas is absent.
    const dock = page.locator('[data-sommelier-dock]');
    await expect(dock).toBeVisible();

    // Hydration-safe submit scoped to the dock (see ask()).
    await ask(page, 'something spicy with tuna', dock);

    await expect(page.locator('[data-panel-loading]')).toBeVisible();

    const panel = page.locator('[data-sommelier-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-answer-text]')).toContainText(
      'Spicy Tuna Roll',
    );
    await expect(page.locator('[data-rec-card]')).toHaveCount(2);
  });
});

// ───────────────────────────── Abstain ────────────────────────────────────

test.describe('T13 / F6-AC3 — abstain shows fallback + menu link, no card grid', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('abstain response → fallback copy + /menu link, zero cards', async ({
    page,
  }) => {
    await mockMenu(page);
    await mockSommelier(page, ABSTAIN_RESPONSE);
    await page.goto('/');

    await ask(page, 'do you have pizza?');

    const panel = page.locator('[data-sommelier-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-answer-text]')).toContainText(
      "we're a sushi shop",
    );
    // Never an empty card grid.
    await expect(page.locator('[data-rec-card]')).toHaveCount(0);
    // Prominent path to the full menu.
    const browse = page.locator('[data-browse-menu]');
    await expect(browse).toBeVisible();
    await expect(browse).toHaveAttribute('href', '/menu');
  });
});

// ───────────────────────────── Error + delayed 503 ────────────────────────

test.describe('T13 — error state + retry (delayed-503, §7.5)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('delayed 503 SOMMELIER_UNAVAILABLE → error state surfaces before the 30s client timeout', async ({
    page,
  }) => {
    await mockMenu(page);
    // Server replies 503 after 1.5s — well inside the 30s client timeout.
    await mockSommelier(page, UNAVAILABLE_503, { status: 503, delayMs: 1500 });
    await page.goto('/');

    const start = Date.now();
    await ask(page, 'something spicy with tuna');
    await expect(page.locator('[data-panel-loading]')).toBeVisible();

    const err = page.locator('[data-panel-error]');
    await expect(err).toBeVisible({ timeout: 10_000 });
    await expect(err).toContainText('temporarily unavailable');
    // Proves the server 503 (not the 30s client timeout) drove the error.
    expect(Date.now() - start).toBeLessThan(10_000);

    await expect(page.locator('[data-retry-button]')).toBeVisible();
  });

  test('retry re-issues the same query and can recover to an answer', async ({
    page,
  }) => {
    await mockMenu(page);
    await page.goto('/');

    // First attempt: 503. Capture the query the client sends on retry.
    let calls = 0;
    const queries: string[] = [];
    await page.route('**/api/sommelier', async (route: Route) => {
      calls += 1;
      queries.push((route.request().postDataJSON() as { query: string }).query);
      if (calls === 1) {
        await route.fulfill({ status: 503, json: UNAVAILABLE_503 });
      } else {
        await route.fulfill({ status: 200, json: ANSWER_RESPONSE });
      }
    });

    await ask(page, 'something spicy with tuna');
    await expect(page.locator('[data-panel-error]')).toBeVisible();

    await page.locator('[data-retry-button]').click();

    await expect(page.locator('[data-sommelier-panel]')).toBeVisible();
    await expect(page.locator('[data-rec-card]')).toHaveCount(2);
    expect(calls).toBe(2);
    expect(queries[1]).toBe('something spicy with tuna');
  });
});

// ───────────────────────────── Cart badge (F8-AC2) ────────────────────────

test.describe('T13 / F8-AC2 — add from a card increments the cart badge', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ask → answer → click Add on a rec card → cart badge increments by 1', async ({
    page,
  }) => {
    await mockMenu(page);
    await mockSommelier(page, ANSWER_RESPONSE);
    await page.goto('/');

    // Badge hidden when the cart is empty.
    await expect(page.locator('[data-cart-badge]')).toHaveCount(0);

    await ask(page, 'something spicy with tuna');
    await expect(page.locator('[data-rec-card]')).toHaveCount(2);

    await page.locator('[data-rec-add]').first().click();

    await expect(page.locator('[data-cart-badge]')).toHaveText('1');
  });
});
