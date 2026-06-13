import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Meal } from '@prisma/client';
import request from 'supertest';
import type { CategoryWithMeals } from '../menu/menu.service';
import { ANTHROPIC_CLIENT } from './anthropic-client';
import { DailyTokenBudget } from './daily-token-budget.service';
import { SOMMELIER_MENU } from './menu.port';
import { SommelierModule } from './sommelier.module';

/**
 * T2/T7 — route-level integration that boots ONLY SommelierModule (no AppModule,
 * no Prisma/DB). This proves the full request path — DTO validation, unknown-
 * field stripping, the wire shape, the 503 budget kill-switch, and the per-IP
 * throttle — runs green without external services or a real API key.
 *
 * T7 wired the LLM path, so two collaborators are stubbed DB-free:
 *   - `SOMMELIER_MENU` (would otherwise pull MenuService→PrismaService) → a
 *     fixed one-meal snapshot;
 *   - `ANTHROPIC_CLIENT` → a fake returning a deterministic model output, so
 *     the route's 200 shape is exercised without a key or network.
 * Guard-level tests (budget 503, throttle 429) run before the handler, so they
 * never reach the faked model.
 */
const STUB_MEAL: Meal = {
  id: 'cm_stub_meal',
  name: 'Stub Roll',
  description: 'A stub roll for DB-free route tests.',
  priceCents: 1290,
  imageUrl: null,
  active: true,
  categoryId: 'cat_stub',
  allergens: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deletedAt: null,
} as Meal;

const STUB_SNAPSHOT: CategoryWithMeals[] = [
  {
    id: 'cat_stub',
    name: 'Stub',
    slug: 'stub',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    meals: [STUB_MEAL],
  } as CategoryWithMeals,
];

const FAKE_CLIENT = {
  createMessage: async () => ({
    rawOutput: {
      answer: 'A grounded stub answer [1].',
      picks: [{ mealId: 'cm_stub_meal', why: 'A stub justification.' }],
      confidence: 'high' as const,
    },
    inputTokens: 100,
    outputTokens: 40,
  }),
};

async function bootSommelierApp(
  env: Record<string, string>,
): Promise<{ app: INestApplication; moduleRef: TestingModule }> {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), SommelierModule],
  })
    .overrideProvider(SOMMELIER_MENU)
    .useValue({ listPublic: async () => STUB_SNAPSHOT })
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue(FAKE_CLIENT)
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return { app, moduleRef };
}

describe('SommelierModule route (T2, DB-free)', () => {
  describe('success shape + validation + budget', () => {
    let app: INestApplication;
    let budget: DailyTokenBudget;

    beforeAll(async () => {
      const booted = await bootSommelierApp({
        SOMMELIER_THROTTLE_LIMIT: '1000',
        SOMMELIER_GLOBAL_THROTTLE_LIMIT: '1000',
      });
      app = booted.app;
      budget = booted.moduleRef.get(DailyTokenBudget);
    });

    afterAll(async () => {
      await app.close();
    });

    it('200 — valid query returns a wire-valid SommelierAskResponse', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'something spicy with tuna' })
        .expect(200);
      expect(typeof res.body.answer).toBe('string');
      expect(Array.isArray(res.body.recommendations)).toBe(true);
      expect(res.body.recommendations.length).toBeLessThanOrEqual(5);
      expect(['high', 'low', 'abstain']).toContain(res.body.confidence);
      expect(res.body.requestId).toMatch(/^req_/);
    });

    it('F1-AC4 — sources non-empty whenever recommendations non-empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'pick something' })
        .expect(200);
      if (res.body.recommendations.length > 0) {
        expect(res.body.sources.length).toBeGreaterThan(0);
      }
    });

    it('requestId is unique per request', async () => {
      const a = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'q1' })
        .expect(200);
      const b = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'q2' })
        .expect(200);
      expect(a.body.requestId).not.toBe(b.body.requestId);
    });

    it('400 — empty query', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: '' })
        .expect(400);
    });

    it('400 — query of 501 chars', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'a'.repeat(501) })
        .expect(400);
    });

    it('200 — query of exactly 500 chars (boundary)', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'a'.repeat(500) })
        .expect(200);
    });

    it('400 — avoidAllergens with >20 items', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({
          query: 'ok',
          avoidAllergens: Array.from({ length: 21 }, (_, i) => `a${i}`),
        })
        .expect(400);
    });

    it('400 — avoidAllergens item longer than 50 chars', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'ok', avoidAllergens: ['a'.repeat(51)] })
        .expect(400);
    });

    it('200 — unknown field stripped (whitelist), not 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'hi', sneaky: 'x', isAdmin: true })
        .expect(200);
      expect(res.body).not.toHaveProperty('sneaky');
      expect(res.body).not.toHaveProperty('isAdmin');
    });

    describe('daily token-budget kill-switch (503)', () => {
      afterEach(() => budget.resetForTest());

      it('503 — over budget returns the pinned envelope before any work', async () => {
        jest.spyOn(budget, 'isOverBudget').mockReturnValue(true);
        const res = await request(app.getHttpServer())
          .post('/sommelier')
          .send({ query: 'anything' })
          .expect(503);
        expect(res.body).toEqual({
          statusCode: 503,
          error: 'SOMMELIER_UNAVAILABLE',
          message:
            'The sommelier is temporarily unavailable. Please try again.',
        });
      });
    });
  });

  describe('per-IP throttle (cost-guard ①)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const booted = await bootSommelierApp({
        SOMMELIER_THROTTLE_LIMIT: '2',
        SOMMELIER_GLOBAL_THROTTLE_LIMIT: '1000',
      });
      app = booted.app;
    });

    afterAll(async () => {
      await app.close();
    });

    it('429 — 3rd request from one IP within the window is throttled', async () => {
      const server = app.getHttpServer();
      await request(server).post('/sommelier').send({ query: '1' }).expect(200);
      await request(server).post('/sommelier').send({ query: '2' }).expect(200);
      await request(server).post('/sommelier').send({ query: '3' }).expect(429);
    });
  });

  describe('app-wide global throttle (cost-guard ①, shared bucket)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const booted = await bootSommelierApp({
        // High per-IP limit, low global cap → the global (constant-key) bucket
        // is what trips, proving the app-wide cap is independent of IP.
        SOMMELIER_THROTTLE_LIMIT: '1000',
        SOMMELIER_GLOBAL_THROTTLE_LIMIT: '2',
      });
      app = booted.app;
    });

    afterAll(async () => {
      await app.close();
    });

    it('429 — 3rd request app-wide is throttled even from distinct IPs', async () => {
      const server = app.getHttpServer();
      // Vary X-Forwarded-For; the global bucket ignores it (constant key).
      await request(server)
        .post('/sommelier')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ query: '1' })
        .expect(200);
      await request(server)
        .post('/sommelier')
        .set('X-Forwarded-For', '10.0.0.2')
        .send({ query: '2' })
        .expect(200);
      await request(server)
        .post('/sommelier')
        .set('X-Forwarded-For', '10.0.0.3')
        .send({ query: '3' })
        .expect(429);
    });
  });
});
