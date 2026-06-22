import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SOMMELIER_MENU } from './menu.port';
import { SommelierModule } from './sommelier.module';
import { sommelierConfig } from './sommelier.config';

/**
 * T3/T7 — missing-key boot safety. The app (and SommelierModule) must
 * instantiate with NO `ANTHROPIC_API_KEY` present (CI + dev run without it).
 * This boots ONLY SommelierModule (no AppModule / no Postgres) and proves:
 *   1. compile + init succeed with the key deleted from the environment;
 *   2. the typed config resolves with `anthropicApiKey: undefined` /
 *      `hasAnthropicKey: false`;
 *   3. with the LLM path now live (T7), the route returns the pinned 503
 *      `SOMMELIER_UNAVAILABLE` envelope at call time — boot stays fine, but the
 *      model can't be invoked without a key. This SUPERSEDES T3's earlier
 *      "canned 200 with no key" assertion: the config's own JSDoc predicted
 *      "T7 wires missing key ⇒ 503 at call-time"; that wiring has landed.
 *
 * `SOMMELIER_MENU` is stubbed so the Prisma-less graph compiles and the pipeline
 * reaches the (keyless ⇒ 503) model call; the stub returns an empty menu.
 */
describe('T3/T7 — SommelierModule boots without ANTHROPIC_API_KEY', () => {
  let app: INestApplication;
  let savedKey: string | undefined;

  beforeAll(async () => {
    // env -u ANTHROPIC_API_KEY semantics: ensure it is genuinely absent.
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    // Keep the throttle high so these boot assertions never hit a 429.
    process.env.SOMMELIER_THROTTLE_LIMIT = '1000';
    process.env.SOMMELIER_GLOBAL_THROTTLE_LIMIT = '1000';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), SommelierModule],
    })
      .overrideProvider(SOMMELIER_MENU)
      .useValue({ listPublic: async () => [] })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('typed config reports the key as absent', () => {
    const cfg = sommelierConfig();
    expect(cfg.anthropicApiKey).toBeUndefined();
    expect(cfg.hasAnthropicKey).toBe(false);
  });

  it('route returns the pinned 503 envelope at call time (T7 supersedes the T3 canned 200)', async () => {
    const res = await request(app.getHttpServer())
      .post('/sommelier')
      .send({ query: 'something spicy with tuna' })
      .expect(503);
    expect(res.body).toEqual({
      statusCode: 503,
      error: 'SOMMELIER_UNAVAILABLE',
      message: 'The sommelier is temporarily unavailable. Please try again.',
    });
  });

  it('DTO validation still 400s before the model is reached (no key needed)', async () => {
    await request(app.getHttpServer())
      .post('/sommelier')
      .send({ query: '' })
      .expect(400);
  });
});
