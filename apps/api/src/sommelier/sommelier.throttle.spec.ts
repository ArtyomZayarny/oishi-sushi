import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { ANTHROPIC_CLIENT } from './anthropic-client';
import {
  SOMMELIER_GLOBAL_THROTTLER,
  buildSommelierThrottlers,
} from './sommelier.throttle';

// T7: the per-IP throttle integration asserts 200 on the first requests; with
// no key in CI the real LLM provider would 503, so fake ANTHROPIC_CLIENT with a
// deterministic empty-pick output. The throttle behaviour (200 → 200 → 429) is
// what's under test; the model is incidental.
const FAKE_CLIENT = {
  createMessage: async () => ({
    rawOutput: {
      answer: 'A grounded answer.',
      picks: [],
      confidence: 'low' as const,
    },
    inputTokens: 10,
    outputTokens: 5,
  }),
};

// T2 cost-guard ① — throttling on POST /api/sommelier.
//   - Per-IP throttler (default tracker) → SOMMELIER_THROTTLE_LIMIT req/min/IP.
//   - App-wide throttler (constant-key tracker) → SOMMELIER_GLOBAL_THROTTLE_LIMIT
//     req/min across ALL IPs (single shared bucket). Exceeding either → 429.

describe('Sommelier app-wide throttler — constant-key tracker (T2 cost-guard ①)', () => {
  it('the global throttler resolves the same bucket key for every caller', async () => {
    const throttlers = buildSommelierThrottlers({ ip: 5, global: 40 });
    const global = throttlers.find(
      (t) => t.name === SOMMELIER_GLOBAL_THROTTLER,
    );

    expect(global).toBeDefined();
    expect(global?.limit).toBe(40);

    const getTracker = global?.getTracker;
    expect(typeof getTracker).toBe('function');
    if (!getTracker) throw new Error('global throttler missing getTracker');

    // A constant key means two different requests land in the same bucket
    // (the app-wide cap), not in separate per-IP buckets.
    const reqA = { ip: '1.1.1.1' } as Record<string, unknown>;
    const reqB = { ip: '2.2.2.2' } as Record<string, unknown>;
    const keyA = await getTracker(reqA, {} as never);
    const keyB = await getTracker(reqB, {} as never);
    expect(keyA).toBe(keyB);
  });

  it('the per-IP throttler has no custom tracker (uses default per-IP behaviour)', () => {
    const throttlers = buildSommelierThrottlers({ ip: 5, global: 40 });
    const ip = throttlers.find((t) => t.name === 'ip');
    expect(ip).toBeDefined();
    expect(ip?.limit).toBe(5);
    // No custom getTracker → ThrottlerGuard default tracker keys on req.ip.
    expect(ip?.getTracker).toBeUndefined();
  });
});

describe('Sommelier per-IP throttle (T2) — integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-secret-please-override-in-production';
    // Per-IP limit low to trip 429 quickly; global high so it's the IP cap firing.
    process.env.SOMMELIER_THROTTLE_LIMIT = '2';
    process.env.SOMMELIER_GLOBAL_THROTTLE_LIMIT = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ANTHROPIC_CLIENT)
      .useValue(FAKE_CLIENT)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('429 — exceeding the per-IP limit (2/min) on the 3rd request from one IP', async () => {
    const server = app.getHttpServer();
    await request(server).post('/sommelier').send({ query: 'one' }).expect(200);
    await request(server).post('/sommelier').send({ query: 'two' }).expect(200);
    // 3rd request from the same IP within the window → throttled.
    await request(server)
      .post('/sommelier')
      .send({ query: 'three' })
      .expect(429);
  });
});
