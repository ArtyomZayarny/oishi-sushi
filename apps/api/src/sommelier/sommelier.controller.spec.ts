import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { ANTHROPIC_CLIENT } from './anthropic-client';
import { DailyTokenBudget } from './daily-token-budget.service';

// T2/T7 — POST /api/sommelier through the full AppModule (Prisma present).
// Covers: 200 wire shape, DTO validation 400s, unknown-field stripping,
// daily token-budget 503 kill-switch. Throttle behaviour lives in its own
// spec and is exercised here only for the per-IP path where it is cheap to set
// the limit low via env.
//
// T7 wired the LLM path: with no `ANTHROPIC_API_KEY` in CI the real provider
// would 503. The fake returns an empty-pick, low-confidence output so the
// 200-path SHAPE assertions (0..5 recs; sources non-empty iff recs non-empty)
// stay independent of the live seed contents while still exercising the full
// orchestration (listPublic → candidates → retrieve → assemble).
const FAKE_CLIENT = {
  createMessage: async () => ({
    rawOutput: {
      answer: 'A grounded answer with no citation.',
      picks: [],
      confidence: 'low' as const,
    },
    inputTokens: 100,
    outputTokens: 40,
  }),
};

describe('SommelierController POST /sommelier (T2/T7)', () => {
  let app: INestApplication;
  let budget: DailyTokenBudget;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-secret-please-override-in-production';
    // Keep throttle limits high so validation/shape tests are not rate-limited.
    process.env.SOMMELIER_THROTTLE_LIMIT = '1000';
    process.env.SOMMELIER_GLOBAL_THROTTLE_LIMIT = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // No real key in CI ⇒ the real provider would 503; fake the model so the
      // 200-path shape tests exercise the full orchestration deterministically.
      .overrideProvider(ANTHROPIC_CLIENT)
      .useValue(FAKE_CLIENT)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    budget = moduleRef.get(DailyTokenBudget);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('F1-AC: success shape', () => {
    it('200 — valid query returns a wire-valid SommelierAskResponse', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'something spicy with tuna' })
        .expect(200);

      const body = res.body;
      expect(typeof body.answer).toBe('string');
      expect(Array.isArray(body.recommendations)).toBe(true);
      expect(Array.isArray(body.sources)).toBe(true);
      expect(['high', 'low', 'abstain']).toContain(body.confidence);
      expect(typeof body.requestId).toBe('string');
      expect(body.requestId.length).toBeGreaterThan(0);

      // 0..5 recommendations
      expect(body.recommendations.length).toBeGreaterThanOrEqual(0);
      expect(body.recommendations.length).toBeLessThanOrEqual(5);

      // Each recommendation carries the wire fields.
      for (const rec of body.recommendations) {
        expect(typeof rec.mealId).toBe('string');
        expect(typeof rec.name).toBe('string');
        expect(typeof rec.priceCents).toBe('number');
        expect('imageUrl' in rec).toBe(true);
        expect(typeof rec.why).toBe('string');
      }
    });

    it('F1-AC4 — sources non-empty whenever recommendations non-empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'recommend me something' })
        .expect(200);

      if (res.body.recommendations.length > 0) {
        expect(res.body.sources.length).toBeGreaterThan(0);
      }
    });

    it('200 — accepts optional avoidAllergens array', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'no shellfish please', avoidAllergens: ['shellfish'] })
        .expect(200);
    });
  });

  describe('DTO validation (400)', () => {
    it('400 — empty query', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: '' })
        .expect(400);
    });

    it('400 — missing query', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({})
        .expect(400);
    });

    it('400 — query of 501 chars (over the 500 cap)', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'a'.repeat(501) })
        .expect(400);
    });

    it('200 — query of exactly 500 chars (boundary accepted)', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'a'.repeat(500) })
        .expect(200);
    });

    it('400 — avoidAllergens with more than 20 items', async () => {
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

    it('400 — avoidAllergens is not an array', async () => {
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'ok', avoidAllergens: 'shellfish' })
        .expect(400);
    });
  });

  describe('unknown-field stripping (must NOT 400)', () => {
    it('200 — unknown field in body is stripped, not rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'hi', sneaky: 'should-be-stripped', isAdmin: true })
        .expect(200);
      // Response is still the canned wire shape; nothing reflects the unknown field.
      expect(res.body).not.toHaveProperty('sneaky');
      expect(res.body).not.toHaveProperty('isAdmin');
    });
  });

  describe('daily token-budget kill-switch (503)', () => {
    afterEach(() => {
      // Restore budget state so other tests are unaffected.
      budget.resetForTest();
    });

    it('503 — over-budget returns the pinned SOMMELIER_UNAVAILABLE envelope before doing work', async () => {
      jest.spyOn(budget, 'isOverBudget').mockReturnValue(true);

      const res = await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'anything' })
        .expect(503);

      expect(res.body).toEqual({
        statusCode: 503,
        error: 'SOMMELIER_UNAVAILABLE',
        message: 'The sommelier is temporarily unavailable. Please try again.',
      });
    });

    it('200 — under budget proceeds normally', async () => {
      jest.spyOn(budget, 'isOverBudget').mockReturnValue(false);
      await request(app.getHttpServer())
        .post('/sommelier')
        .send({ query: 'anything' })
        .expect(200);
    });
  });
});
