import { Logger } from '@nestjs/common';
import type { Meal } from '@prisma/client';
import type { SommelierSource } from '@org/shared-types';
import type { Candidate, SnapshotMeal } from './candidates';
import type { SommelierModelOutput } from './prompt-builder';
import { postValidate } from './post-validate';
import type { SommelierAskIntermediate } from './sommelier.service';

/**
 * T8 — fail-closed post-validation + assembly (spec §4 step 8–9, §7.4, §10 T8).
 *
 * PURE specs (no Nest module boot, no SDK, no DB). The mocked LLM is replaced by
 * a literal {@link SommelierModelOutput} forced to be ADVERSARIAL: emitting
 * excluded ids, fabricated cuids, wrong names/prices, picks-alongside-abstain,
 * out-of-range citations, and an answer leaking excluded names / URLs / >600
 * chars. The enforced backstop (not the prompt) must neutralize every one.
 *
 * The order under test (ticket T8): (1) on-menu subset, (2) allergen re-check +
 * warn(requestId), (3) cap 5, (4) server-side join from snapshot, (5) abstain
 * invariant + degrade, (6) answer-text scan (no excluded name, no URL, ≤600),
 * (7) [n] citation consistency, (8) return with requestId.
 *
 * AC traceability (DoD): F4-AC2/3, F5-AC1/3, F6-AC1, F1-AC4, §7.4 answer scan.
 */

function meal(over: Partial<Meal> = {}): SnapshotMeal {
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
    category: 'Maki',
    ...over,
  } as SnapshotMeal;
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cm_meal_1',
    name: 'Spicy Tuna Roll',
    description: 'Sriracha-marinated tuna.',
    priceCents: 1290,
    allergens: ['Fish', 'Soy'],
    category: 'Maki',
    isNewest: false,
    ...over,
  };
}

/** Build a {@link SnapshotMeal} map from rows (the request-scope snapshot). */
function snapshot(rows: SnapshotMeal[]): Map<string, SnapshotMeal> {
  return new Map(rows.map((m) => [m.id, m]));
}

function menuSources(...ids: string[]): SommelierSource[] {
  return ids.map((ref) => ({ type: 'menu', ref }));
}

function intermediate(over: {
  rawOutput?: Partial<SommelierModelOutput>;
  candidates?: Candidate[];
  excludedIds?: string[];
  sources?: SommelierSource[];
  requestId?: string;
}): SommelierAskIntermediate {
  const candidates = over.candidates ?? [candidate()];
  return {
    rawOutput: {
      answer: 'The Spicy Tuna Roll [1] is the pick.',
      picks: [{ mealId: 'cm_meal_1', why: 'Sriracha tuna.' }],
      confidence: 'high',
      ...over.rawOutput,
    },
    candidates,
    excludedIds: over.excludedIds ?? [],
    sources: over.sources ?? menuSources(...candidates.map((c) => c.id)),
    requestId: over.requestId ?? 'req_test_1',
  };
}

describe('T8 — postValidate (fail-closed post-validation + assembly)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('F5-AC1 — on-menu subset (drop fabricated ids)', () => {
    it('drops a pick whose mealId is not in the request snapshot (fabricated cuid)', () => {
      const snap = snapshot([meal({ id: 'cm_real' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_real' })],
          rawOutput: {
            answer: 'Two picks [1].',
            picks: [
              { mealId: 'cm_real', why: 'real' },
              { mealId: 'cm_fabricated_does_not_exist', why: 'hallucinated' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations.map((r) => r.mealId)).toEqual(['cm_real']);
    });

    it('when ALL picks are fabricated (none in snapshot) ⇒ confidence:abstain + empty recommendations (degrade)', () => {
      const snap = snapshot([meal({ id: 'cm_real' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_real' })],
          rawOutput: {
            answer: 'Here are picks [1].',
            picks: [
              { mealId: 'cm_ghost_1', why: 'nope' },
              { mealId: 'cm_ghost_2', why: 'nope' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations).toEqual([]);
      expect(res.confidence).toBe('abstain');
    });

    it('drops a pick that is in the snapshot but was NOT a candidate (defense in depth)', () => {
      // snapshot has two meals, but only one was offered as a candidate.
      const snap = snapshot([
        meal({ id: 'cm_offered' }),
        meal({ id: 'cm_not_offered', name: 'Hidden Roll' }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_offered' })],
          rawOutput: {
            answer: 'Picks [1].',
            picks: [
              { mealId: 'cm_offered', why: 'ok' },
              { mealId: 'cm_not_offered', why: 'leaked' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations.map((r) => r.mealId)).toEqual(['cm_offered']);
    });
  });

  describe('F4-AC2 — allergen re-check (fail-closed) drops excluded id + logs warn(requestId)', () => {
    it('drops a pick whose mealId is in excludedIds even though the model emitted it', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      // The excluded meal is still in the snapshot map (we joined it earlier) but
      // is in excludedIds and is NOT a candidate. The model tries to recommend it.
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Veg Roll', allergens: [] }),
        meal({ id: 'cm_fish', name: 'Salmon Nigiri', allergens: ['Fish'] }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Veg Roll' })],
          excludedIds: ['cm_fish'],
          rawOutput: {
            answer: 'Try these [1].',
            picks: [
              { mealId: 'cm_safe', why: 'safe' },
              { mealId: 'cm_fish', why: 'model bypassed the prompt' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations.map((r) => r.mealId)).toEqual(['cm_safe']);
      // warn fired and carried the requestId (privacy: id only, never query text).
      const warned = warnSpy.mock.calls.some((c) =>
        JSON.stringify(c).includes('req_test_1'),
      );
      expect(warned).toBe(true);
    });

    it('does NOT warn when no excluded id is emitted', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const snap = snapshot([meal({ id: 'cm_safe' })]);
      postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe' })],
          excludedIds: ['cm_other'],
          rawOutput: {
            answer: 'Pick [1].',
            picks: [{ mealId: 'cm_safe', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('F4-AC3 — forced excluded id absent from recommendations AND its name absent from answer', () => {
    it('a forced-excluded mealId never appears in recommendations and its name is scrubbed from the answer', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Avocado Roll', allergens: [] }),
        meal({
          id: 'cm_shrimp',
          name: 'Ebi Tempura Roll',
          allergens: ['Shellfish'],
        }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Avocado Roll' })],
          excludedIds: ['cm_shrimp'],
          rawOutput: {
            // The model both recommends the unsafe meal AND names it in prose.
            answer:
              'You should get the Ebi Tempura Roll [1] and the Avocado Roll [1].',
            picks: [
              { mealId: 'cm_shrimp', why: 'crispy shrimp' },
              { mealId: 'cm_safe', why: 'creamy' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations.map((r) => r.mealId)).not.toContain(
        'cm_shrimp',
      );
      expect(res.recommendations.map((r) => r.mealId)).toContain('cm_safe');
      expect(res.answer.toLowerCase()).not.toContain(
        'ebi tempura roll'.toLowerCase(),
      );
      // The safe meal's name may remain.
      expect(res.answer).toContain('Avocado Roll');
    });

    it('scrubs the excluded name case-insensitively', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Cucumber Roll', allergens: [] }),
        meal({
          id: 'cm_crab',
          name: 'Soft Shell Crab Roll',
          allergens: ['Shellfish'],
        }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Cucumber Roll' })],
          excludedIds: ['cm_crab'],
          rawOutput: {
            answer:
              'The SOFT SHELL CRAB ROLL is great, but try Cucumber Roll [1].',
            picks: [{ mealId: 'cm_safe', why: 'fresh' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.toLowerCase()).not.toContain('soft shell crab roll');
    });
  });

  describe('F5-AC3 — name/priceCents/imageUrl joined server-side from snapshot', () => {
    it('uses DB name/price/imageUrl even when the model returns a wrong name/price for a valid id', () => {
      const snap = snapshot([
        meal({
          id: 'cm_meal_1',
          name: 'Spicy Tuna Roll',
          priceCents: 1290,
          imageUrl: '/img/str.jpg',
        }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: 'Pick [1].',
            // Model lies about name + price (no name/price fields exist on a
            // pick, but even a future leak must be ignored — we read the snapshot).
            picks: [{ mealId: 'cm_meal_1', why: 'tasty' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      const rec = res.recommendations.find((r) => r.mealId === 'cm_meal_1');
      expect(rec?.name).toBe('Spicy Tuna Roll');
      expect(rec?.priceCents).toBe(1290);
      expect(rec?.imageUrl).toBe('/img/str.jpg');
      expect(rec?.why).toBe('tasty');
    });

    it('imageUrl is null when the snapshot meal has no image', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1', imageUrl: null })]);
      const res = postValidate(
        intermediate({ candidates: [candidate({ id: 'cm_meal_1' })] }),
        snap,
      );
      expect(res.recommendations[0].imageUrl).toBeNull();
    });
  });

  describe('cap at 5', () => {
    it('caps recommendations at 5 even if the model returns more valid picks', () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s) => `cm_${s}`);
      const snap = snapshot(ids.map((id) => meal({ id, name: id })));
      const res = postValidate(
        intermediate({
          candidates: ids.map((id) => candidate({ id, name: id })),
          rawOutput: {
            answer: 'Many picks [1].',
            picks: ids.map((id) => ({ mealId: id, why: 'x' })),
            confidence: 'high',
          },
          sources: menuSources(...ids),
        }),
        snap,
      );
      expect(res.recommendations).toHaveLength(5);
      // keeps the first five in pick order.
      expect(res.recommendations.map((r) => r.mealId)).toEqual(ids.slice(0, 5));
    });
  });

  describe('F6-AC1 — abstain invariant (confidence:abstain ⟹ recommendations:[])', () => {
    it('drops picks the model emitted alongside abstain', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: "We don't have that, but try the menu.",
            picks: [{ mealId: 'cm_meal_1', why: 'leaked alongside abstain' }],
            confidence: 'abstain',
          },
        }),
        snap,
      );
      expect(res.confidence).toBe('abstain');
      expect(res.recommendations).toEqual([]);
    });
  });

  describe('degrade rule — all picks dropped ⇒ abstain', () => {
    it('degrades high-confidence to abstain when every pick is dropped by the allergen re-check', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([meal({ id: 'cm_fish', allergens: ['Fish'] })]);
      const res = postValidate(
        intermediate({
          candidates: [],
          excludedIds: ['cm_fish'],
          sources: [],
          rawOutput: {
            answer: 'Get the fish thing [1].',
            picks: [{ mealId: 'cm_fish', why: 'bypassed' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.confidence).toBe('abstain');
      expect(res.recommendations).toEqual([]);
    });

    it('a genuine abstain with no picks stays abstain with empty recs (no spurious degrade flag)', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: "We don't serve pizza.",
            picks: [],
            confidence: 'abstain',
          },
        }),
        snap,
      );
      expect(res.confidence).toBe('abstain');
      expect(res.recommendations).toEqual([]);
    });
  });

  describe('§7.4 answer-text scan — no URLs, length cap ≤600', () => {
    it('strips http/https URLs from the answer', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer:
              'Use code at https://evil.example.com/free100 or http://x.io now [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer).not.toMatch(/https?:\/\//i);
      expect(res.answer).not.toContain('evil.example.com');
    });

    it('strips bare www. URLs from the answer', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: 'Visit www.discounts.example for deals [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer).not.toContain('www.discounts.example');
    });

    it('caps the answer at 600 characters', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const longAnswer = 'a'.repeat(800) + ' [1]';
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: longAnswer,
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.length).toBeLessThanOrEqual(600);
    });
  });

  describe('F1-AC4 — citation consistency ([n] in range; sources non-empty when recs non-empty)', () => {
    it('strips out-of-range [n] markers (n > sources.length)', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          sources: menuSources('cm_meal_1'), // length 1 → only [1] valid
          rawOutput: {
            answer: 'Pick [1] and also [5] and [9].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      // [1] kept; [5] and [9] removed (out of range).
      expect(res.answer).toContain('[1]');
      expect(res.answer).not.toContain('[5]');
      expect(res.answer).not.toContain('[9]');
    });

    it('strips [0] (citations are 1-based)', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          sources: menuSources('cm_meal_1'),
          rawOutput: {
            answer: 'Pick [0] and [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer).not.toContain('[0]');
      expect(res.answer).toContain('[1]');
    });

    it('sources is non-empty whenever recommendations is non-empty', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({ candidates: [candidate({ id: 'cm_meal_1' })] }),
        snap,
      );
      expect(res.recommendations.length).toBeGreaterThan(0);
      expect(res.sources.length).toBeGreaterThan(0);
    });
  });

  describe('passthrough & shape', () => {
    it('returns the requestId unchanged', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          requestId: 'req_abc_123',
        }),
        snap,
      );
      expect(res.requestId).toBe('req_abc_123');
    });

    it('returns the prebuilt sources unchanged (candidate-indexed, not renumbered)', () => {
      const snap = snapshot([
        meal({ id: 'cm_a' }),
        meal({ id: 'cm_b', name: 'B' }),
      ]);
      const sources = menuSources('cm_a', 'cm_b');
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_a' }), candidate({ id: 'cm_b' })],
          sources,
          rawOutput: {
            // model drops the first pick → sources must NOT renumber.
            answer: 'Pick [2].',
            picks: [{ mealId: 'cm_b', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.sources).toEqual(sources);
      // [2] is still valid (2 ≤ sources.length) so it survives.
      expect(res.answer).toContain('[2]');
    });

    it('carries a short model why text through unchanged (within the 300-char cap)', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: 'Pick [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'a grounded reason' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations[0].why).toBe('a grounded reason');
    });
  });

  // ───────────────────────── Reviewer-found leaks (release-blocking) ─────────
  // The id-level gate is airtight; these exercise scrubAnswer / the join, which
  // earlier specs under-tested (apostrophe-free names, scheme/www URLs only).

  describe('BLOCKER 1 / F4-AC3 — apostrophe-variant of an excluded name must not leak', () => {
    it('scrubs straight-apostrophe AND apostrophe-absent variants of a curly-apostrophe excluded name', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      // Snapshot excluded dish uses the seed's U+2019 curly apostrophe.
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Avocado Roll', allergens: [] }),
        meal({ id: 'cm_omakase', name: 'Chef’s Omakase', allergens: ['Fish'] }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Avocado Roll' })],
          excludedIds: ['cm_omakase'],
          rawOutput: {
            // Model writes BOTH the straight-apostrophe and the no-apostrophe form.
            answer:
              "Try the Chef's Omakase or the Chefs Omakase — actually, the Avocado Roll [1] is safe.",
            picks: [{ mealId: 'cm_safe', why: 'creamy' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.toLowerCase()).not.toContain("chef's omakase");
      expect(res.answer.toLowerCase()).not.toContain('chefs omakase');
      // The curly form must not survive either.
      expect(res.answer).not.toContain('Chef’s Omakase');
      expect(res.answer).toContain('Avocado Roll');
    });

    it('scrubs the curly-apostrophe form when the snapshot name is curly', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Edamame', allergens: [] }),
        meal({
          id: 'cm_couple',
          name: 'Couple’s Set',
          allergens: ['Shellfish'],
        }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Edamame' })],
          excludedIds: ['cm_couple'],
          rawOutput: {
            answer: 'The Couple’s Set is popular, but try Edamame [1].',
            picks: [{ mealId: 'cm_safe', why: 'simple' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.toLowerCase()).not.toContain('couple');
    });
  });

  describe('BLOCKER 2 / §11 — bare-domain URLs (no scheme, no www.) must be stripped', () => {
    it('strips a bare-host promo domain with a path and a shortener', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer:
              'Grab the deal at oishi-deals.com/promo or bit.ly/xyz right now [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer).not.toContain('oishi-deals.com');
      expect(res.answer).not.toContain('bit.ly/xyz');
      expect(res.answer).not.toContain('bit.ly');
    });

    it('strips a multi-label bare host (sub.domain.co.uk style → .co TLD with path)', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: 'See promo.oishi.shop/x for codes [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer).not.toContain('promo.oishi.shop');
    });
  });

  describe('BLOCKER 3 / F1-AC1 — every why is 1–300 chars (clamp in the join)', () => {
    it('clamps a 2000-char why to at most 300 chars', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          rawOutput: {
            answer: 'Pick [1].',
            picks: [{ mealId: 'cm_meal_1', why: 'x'.repeat(2000) }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations).toHaveLength(1);
      expect(res.recommendations[0].why.length).toBeLessThanOrEqual(300);
      expect(res.recommendations[0].why.length).toBeGreaterThanOrEqual(1);
    });

    it('drops a pick whose why is empty/whitespace (1-char lower bound)', () => {
      const snap = snapshot([
        meal({ id: 'cm_blank' }),
        meal({ id: 'cm_good', name: 'Good Roll' }),
      ]);
      const res = postValidate(
        intermediate({
          candidates: [
            candidate({ id: 'cm_blank' }),
            candidate({ id: 'cm_good', name: 'Good Roll' }),
          ],
          sources: menuSources('cm_blank', 'cm_good'),
          rawOutput: {
            answer: 'Picks [1] and [2].',
            picks: [
              { mealId: 'cm_blank', why: '   ' },
              { mealId: 'cm_good', why: 'tasty' },
            ],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations.map((r) => r.mealId)).toEqual(['cm_good']);
    });

    it('degrades to abstain when the ONLY pick is dropped for an empty why', () => {
      const snap = snapshot([meal({ id: 'cm_blank' })]);
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_blank' })],
          rawOutput: {
            answer: 'Pick [1].',
            picks: [{ mealId: 'cm_blank', why: '' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.recommendations).toEqual([]);
      expect(res.confidence).toBe('abstain');
    });
  });

  describe('Hardening #4 — length cap runs LAST (never severs a citation)', () => {
    it('truncation to 600 does not leave a half-citation like "[1"', () => {
      const snap = snapshot([meal({ id: 'cm_meal_1' })]);
      // Pad to exactly push a valid [1] across the 600 boundary: 598 chars then "[1]".
      const answer = 'a'.repeat(598) + '[1]';
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_meal_1' })],
          sources: menuSources('cm_meal_1'),
          rawOutput: {
            answer,
            picks: [{ mealId: 'cm_meal_1', why: 'ok' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.length).toBeLessThanOrEqual(600);
      // No dangling open-bracket-digit without a closing bracket.
      expect(res.answer).not.toMatch(/\[\d+$/);
    });
  });

  describe('Hardening #5 — zero-width / NBSP evasion of the name scrub is closed', () => {
    it('scrubs an excluded name even when the model injects zero-width chars between letters', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Miso Soup', allergens: [] }),
        meal({ id: 'cm_eel', name: 'Unagi Roll', allergens: ['Fish'] }),
      ]);
      // Insert U+200B (zero-width space) between letters of the excluded name.
      const zwsp = '​';
      const evaded = `U${zwsp}n${zwsp}a${zwsp}g${zwsp}i Roll`;
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Miso Soup' })],
          excludedIds: ['cm_eel'],
          rawOutput: {
            answer: `Try the ${evaded} — or the Miso Soup [1].`,
            picks: [{ mealId: 'cm_safe', why: 'warm' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.toLowerCase()).not.toContain('unagi roll');
      // And the raw zero-width chars are gone from the output.
      expect(res.answer).not.toContain('​');
    });

    it('normalizes NBSP to a normal space so an NBSP-separated excluded name is scrubbed', () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const snap = snapshot([
        meal({ id: 'cm_safe', name: 'Green Tea', allergens: [] }),
        meal({ id: 'cm_fish', name: 'Salmon Sashimi', allergens: ['Fish'] }),
      ]);
      const nbsp = ' ';
      const res = postValidate(
        intermediate({
          candidates: [candidate({ id: 'cm_safe', name: 'Green Tea' })],
          excludedIds: ['cm_fish'],
          rawOutput: {
            answer: `Skip the Salmon${nbsp}Sashimi; have Green Tea [1].`,
            picks: [{ mealId: 'cm_safe', why: 'light' }],
            confidence: 'high',
          },
        }),
        snap,
      );
      expect(res.answer.toLowerCase()).not.toContain('salmon sashimi');
      expect(res.answer).not.toContain(nbsp);
    });
  });
});
