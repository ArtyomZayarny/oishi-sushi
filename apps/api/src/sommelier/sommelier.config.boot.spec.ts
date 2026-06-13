import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SommelierModule } from './sommelier.module';
import { sommelierConfig } from './sommelier.config';

/**
 * T3 — missing-key boot safety. The app (and SommelierModule) must instantiate
 * and serve the route with NO `ANTHROPIC_API_KEY` present (CI + dev run without
 * it). This boots ONLY SommelierModule (no AppModule / no Postgres) and proves:
 *   1. compile + init succeed with the key deleted from the environment;
 *   2. the typed config resolves with `anthropicApiKey: undefined` /
 *      `hasAnthropicKey: false`;
 *   3. the route still returns T2's canned 200 — NOT a premature 503. The
 *      "missing key ⇒ 503 at call-time" mapping is T7's job, once the LLM path
 *      exists; T3 must not introduce it.
 */
describe('T3 — SommelierModule boots without ANTHROPIC_API_KEY', () => {
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
    }).compile();
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

  it('route still returns the canned 200 (no premature 503)', async () => {
    const res = await request(app.getHttpServer())
      .post('/sommelier')
      .send({ query: 'something spicy with tuna' })
      .expect(200);
    expect(typeof res.body.answer).toBe('string');
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(['high', 'low', 'abstain']).toContain(res.body.confidence);
    expect(res.body.requestId).toMatch(/^req_/);
  });
});
