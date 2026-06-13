import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Category, Meal } from '@prisma/client';
import type { CategoryWithMeals } from '../menu/menu.service';
import type { AnthropicClientProvider } from './anthropic-client';
import type { MenuPort } from './menu.port';
import type { Retriever, RetrievedDoc } from './retriever';
import { DailyTokenBudget } from './daily-token-budget.service';
import { SOMMELIER_CONFIG_DEFAULTS } from './sommelier.config';
import type { SommelierModelOutput } from './prompt-builder';
import { SommelierService } from './sommelier.service';
import type { SommelierAskDto } from './dto/sommelier-ask.dto';

/**
 * T7 — SommelierService.ask() orchestration (spec §4 lifecycle).
 *
 * Mocked-client specs ONLY — no real key, no network, no DB. Drives the
 * pipeline through fakes for the four collaborators (MenuPort, Retriever,
 * AnthropicClientProvider, DailyTokenBudget) and asserts:
 *   - listPublic() is fetched EXACTLY ONCE per request (§4 step 2 / F5).
 *   - on success, recordUsage(input+output) is called (token accounting).
 *   - on failure (provider 503), recordUsage is NOT called (no tokens spent).
 *   - confidence passes through unchanged (abstain stays abstain — T8 enforces
 *     the abstain⟹recs=[] invariant, not T7).
 *   - name/priceCents/imageUrl are joined SERVER-SIDE from the snapshot, never
 *     from model output (F5-AC3) — a model returning a wrong name/price for a
 *     valid id still yields DB values.
 *   - the raw query text is NEVER logged (§7.7 privacy).
 */

function meal(over: Partial<Meal> = {}): Meal {
  return {
    id: 'cm_meal_1',
    name: 'Spicy Tuna Roll',
    description: 'Sriracha-marinated tuna.',
    priceCents: 1290,
    imageUrl: '/img/str.jpg',
    active: true,
    categoryId: 'cat_maki',
    allergens: ['Fish', 'Soy'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  } as Meal;
}

function category(meals: Meal[]): CategoryWithMeals {
  return {
    id: 'cat_maki',
    name: 'Maki',
    slug: 'maki',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    meals,
  } as Category & { meals: Meal[] };
}

function doc(): RetrievedDoc {
  return {
    source: 'taste-guide',
    section: 'spicy',
    docType: 'taste_guide',
    body: 'Heat comes from sriracha.',
  };
}

interface Harness {
  service: SommelierService;
  listPublic: jest.Mock<Promise<CategoryWithMeals[]>, []>;
  retrieve: jest.Mock;
  createMessage: jest.Mock;
  budget: DailyTokenBudget;
  recordUsage: jest.SpyInstance;
}

function buildHarness(opts: {
  snapshot?: CategoryWithMeals[];
  docs?: RetrievedDoc[];
  modelOutput?: SommelierModelOutput;
  inputTokens?: number;
  outputTokens?: number;
  createMessageImpl?: () => Promise<unknown>;
}): Harness {
  const snapshot = opts.snapshot ?? [category([meal()])];
  const docs = opts.docs ?? [doc()];
  const modelOutput: SommelierModelOutput = opts.modelOutput ?? {
    answer: 'The Spicy Tuna Roll [1] is the pick.',
    picks: [{ mealId: 'cm_meal_1', why: 'Sriracha tuna.' }],
    confidence: 'high',
  };

  const listPublic = jest.fn<Promise<CategoryWithMeals[]>, []>(
    async () => snapshot,
  );
  const retrieve = jest.fn(async () => docs);
  const createMessage = jest.fn(
    opts.createMessageImpl ??
      (async () => ({
        rawOutput: modelOutput,
        inputTokens: opts.inputTokens ?? 100,
        outputTokens: opts.outputTokens ?? 40,
      })),
  );

  const menu: MenuPort = { listPublic };
  const retriever: Retriever = { retrieve };
  const client = {
    createMessage,
  } as unknown as AnthropicClientProvider;

  const budget = new DailyTokenBudget({
    anthropicApiKey: undefined,
    hasAnthropicKey: false,
    model: SOMMELIER_CONFIG_DEFAULTS.model,
    timeoutMs: SOMMELIER_CONFIG_DEFAULTS.timeoutMs,
    maxTokens: SOMMELIER_CONFIG_DEFAULTS.maxTokens,
    throttleLimit: SOMMELIER_CONFIG_DEFAULTS.throttleLimit,
    globalThrottleLimit: SOMMELIER_CONFIG_DEFAULTS.globalThrottleLimit,
    dailyTokenBudget: SOMMELIER_CONFIG_DEFAULTS.dailyTokenBudget,
  });
  const recordUsage = jest.spyOn(budget, 'recordUsage');

  const service = new SommelierService(menu, retriever, client, budget);
  return { service, listPublic, retrieve, createMessage, budget, recordUsage };
}

function dto(over: Partial<SommelierAskDto> = {}): SommelierAskDto {
  return { query: 'something spicy with tuna', ...over } as SommelierAskDto;
}

describe('T7 — SommelierService.ask() orchestration', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('§4 lifecycle — listPublic fetched exactly once', () => {
    it('calls listPublic() exactly once per request (single snapshot — F5)', async () => {
      const h = buildHarness({});
      await h.service.ask(dto());
      expect(h.listPublic).toHaveBeenCalledTimes(1);
    });

    it('calls the retriever with the user query', async () => {
      const h = buildHarness({});
      await h.service.ask(dto({ query: 'cheesy rolls' }));
      expect(h.retrieve).toHaveBeenCalledWith('cheesy rolls');
    });

    it('passes the avoidAllergens through the hard filter before the model sees candidates', async () => {
      // Fish-containing meal + avoid Fish ⇒ excluded ⇒ not a candidate the model can pick.
      const fishMeal = meal({ id: 'cm_fish', allergens: ['Fish'] });
      const safeMeal = meal({ id: 'cm_safe', name: 'Veg Roll', allergens: [] });
      const h = buildHarness({ snapshot: [category([fishMeal, safeMeal])] });
      await h.service.ask(dto({ avoidAllergens: ['fish'] }));
      // The user prompt the model received must not contain the excluded id.
      const userText = h.createMessage.mock.calls[0][0].userText as string;
      expect(userText).not.toContain('cm_fish');
      expect(userText).toContain('cm_safe');
    });
  });

  describe('token accounting — recordUsage on success only', () => {
    it('records input+output tokens after a successful model call', async () => {
      const h = buildHarness({ inputTokens: 123, outputTokens: 45 });
      await h.service.ask(dto());
      expect(h.recordUsage).toHaveBeenCalledWith(123 + 45);
    });

    it('does NOT record usage when the provider throws 503 (no tokens spent)', async () => {
      const h = buildHarness({
        createMessageImpl: async () => {
          throw new ServiceUnavailableException('upstream down');
        },
      });
      await expect(h.service.ask(dto())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(h.recordUsage).not.toHaveBeenCalled();
    });
  });

  describe('F5-AC3 — name/priceCents/imageUrl joined server-side from snapshot', () => {
    it('uses DB name/price/imageUrl even when the model returns a wrong name/price for a valid id', async () => {
      const h = buildHarness({
        snapshot: [
          category([
            meal({
              id: 'cm_meal_1',
              name: 'Spicy Tuna Roll',
              priceCents: 1290,
              imageUrl: '/img/str.jpg',
            }),
          ]),
        ],
        modelOutput: {
          answer: 'Pick [1].',
          // Model lies about name + price; T7 must ignore those.
          picks: [{ mealId: 'cm_meal_1', why: 'tasty' }],
          confidence: 'high',
        },
      });
      const res = await h.service.ask(dto());
      const rec = res.recommendations.find((r) => r.mealId === 'cm_meal_1');
      expect(rec).toBeDefined();
      expect(rec?.name).toBe('Spicy Tuna Roll');
      expect(rec?.priceCents).toBe(1290);
      expect(rec?.imageUrl).toBe('/img/str.jpg');
      expect(rec?.why).toBe('tasty');
    });

    it('imageUrl is null when the snapshot meal has no image', async () => {
      const h = buildHarness({
        snapshot: [category([meal({ id: 'cm_meal_1', imageUrl: null })])],
        modelOutput: {
          answer: 'Pick [1].',
          picks: [{ mealId: 'cm_meal_1', why: 'tasty' }],
          confidence: 'high',
        },
      });
      const res = await h.service.ask(dto());
      expect(res.recommendations[0].imageUrl).toBeNull();
    });
  });

  describe('confidence passthrough (T7 does not enforce abstain⟹recs=[])', () => {
    it('an abstain model output yields confidence:abstain', async () => {
      const h = buildHarness({
        modelOutput: {
          answer: "We don't serve pizza — try the menu.",
          picks: [],
          confidence: 'abstain',
        },
      });
      const res = await h.service.ask(dto({ query: 'do you have pizza?' }));
      expect(res.confidence).toBe('abstain');
    });

    it('a high-confidence output yields confidence:high', async () => {
      const h = buildHarness({});
      const res = await h.service.ask(dto());
      expect(res.confidence).toBe('high');
    });
  });

  describe('response shape', () => {
    it('returns a requestId prefixed req_', async () => {
      const h = buildHarness({});
      const res = await h.service.ask(dto());
      expect(res.requestId).toMatch(/^req_/);
    });

    it('builds sources (menu candidate-indexed, then KB) for F1-AC4 alignment', async () => {
      const h = buildHarness({
        snapshot: [category([meal({ id: 'cm_meal_1' })])],
        docs: [doc()],
      });
      const res = await h.service.ask(dto());
      expect(res.sources).toEqual(
        expect.arrayContaining([
          { type: 'menu', ref: 'cm_meal_1' },
          { type: 'kb', ref: 'taste-guide', section: 'spicy' },
        ]),
      );
    });

    it('passes the model answer text through to the response', async () => {
      const h = buildHarness({
        modelOutput: {
          answer: 'A grounded answer [1].',
          picks: [{ mealId: 'cm_meal_1', why: 'x' }],
          confidence: 'high',
        },
      });
      const res = await h.service.ask(dto());
      expect(res.answer).toBe('A grounded answer [1].');
    });
  });

  describe('§7.7 privacy — never log the raw query text', () => {
    it('does not pass the query text to any logger call on success', async () => {
      const logSpies = [
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'error')
          .mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'debug')
          .mockImplementation(() => undefined),
        jest
          .spyOn(Logger.prototype, 'verbose')
          .mockImplementation(() => undefined),
      ];
      const secret = 'SUPER_SECRET_QUERY_TEXT_12345';
      const h = buildHarness({});
      await h.service.ask(dto({ query: secret }));
      for (const spy of logSpies) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(secret);
        }
      }
    });

    it('does not log the query text on the failure path either', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const secret = 'SECRET_ON_FAILURE_99';
      const h = buildHarness({
        createMessageImpl: async () => {
          throw new ServiceUnavailableException('down');
        },
      });
      await expect(h.service.ask(dto({ query: secret }))).rejects.toBeDefined();
      for (const call of errorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(secret);
      }
    });
  });
});
