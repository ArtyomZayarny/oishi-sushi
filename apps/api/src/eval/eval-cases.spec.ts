import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalCase, EvalIntent } from './case.types';

/**
 * T9 — committed guard for `cases.json` (spec §11 composition). Fails CI if the
 * eval set is weakened below the §11 minimums or drifts off the committed 6-meal
 * seed. Runs inside `nx test api` (no key, no DB — it only reads the JSON file).
 *
 * §11 composition: ≥8 preference · ≥3 allergen · ≥4 out-of-scope/abstain
 * (= ≥3 unknown-topic + ≥1 deals) · ≥2 newest · 1 prompt-injection; total 18–20.
 */

// The exact committed seed vocabulary — `Meal.name` (U+2019 apostrophe in
// "Chef’s Omakase" / "Couple’s Set") and the allergen tags. Mirrors
// `prisma/seed.ts`; a drift here means the eval no longer targets the real menu.
const SEED_MEAL_NAMES = new Set([
  'Otoro Selection',
  'Chef’s Omakase',
  'Toro Truffle Roll',
  'Sashimi Moriawase',
  'Ikura Don',
  'Couple’s Set',
]);
const SEED_ALLERGENS = new Set(['fish', 'shellfish', 'soy']);

const cases: EvalCase[] = JSON.parse(
  readFileSync(join(__dirname, 'cases.json'), 'utf8'),
);

function byIntent(intent: EvalIntent): EvalCase[] {
  return cases.filter((c) => c.intent === intent);
}

describe('T9 — eval cases.json (§11 composition guard)', () => {
  it('contains 18–20 cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(18);
    expect(cases.length).toBeLessThanOrEqual(20);
  });

  it('every case has a unique id', () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every case has a non-empty query within the 1..500 DTO bounds', () => {
    for (const c of cases) {
      expect(typeof c.query).toBe('string');
      expect(c.query.length).toBeGreaterThanOrEqual(1);
      expect(c.query.length).toBeLessThanOrEqual(500);
    }
  });

  it('every case declares a valid intent', () => {
    const valid = new Set<EvalIntent>([
      'preference',
      'allergen',
      'newest',
      'abstain',
      'injection',
    ]);
    for (const c of cases) {
      expect(valid.has(c.intent)).toBe(true);
    }
  });

  describe('§11 category minimums', () => {
    it('≥8 preference cases', () => {
      expect(byIntent('preference').length).toBeGreaterThanOrEqual(8);
    });

    it('≥3 allergen cases', () => {
      expect(byIntent('allergen').length).toBeGreaterThanOrEqual(3);
    });

    it('≥2 newest cases', () => {
      expect(byIntent('newest').length).toBeGreaterThanOrEqual(2);
    });

    it('exactly 1 prompt-injection case', () => {
      expect(byIntent('injection').length).toBe(1);
    });

    it('≥4 out-of-scope/abstain cases (abstain ∪ injection, both must abstain)', () => {
      // §11 counts the injection probe toward the ≥4 out-of-scope bucket: it too
      // must not fabricate. abstain (4) + injection (1) = 5 ≥ 4.
      const outOfScope = cases.filter(
        (c) => c.intent === 'abstain' || c.intent === 'injection',
      );
      expect(outOfScope.length).toBeGreaterThanOrEqual(4);
    });

    it('≥3 unknown-topic abstain cases (not a deals question)', () => {
      // Heuristic split: a "deals" abstain mentions deals/discount/offer/coupon;
      // the rest are unknown-topic. §11 wants ≥3 unknown-topic + ≥1 deals.
      const dealsRe = /deal|discount|coupon|offer|promo|special/i;
      const abstains = byIntent('abstain');
      const deals = abstains.filter((c) => dealsRe.test(c.query));
      const unknownTopic = abstains.filter((c) => !dealsRe.test(c.query));
      expect(unknownTopic.length).toBeGreaterThanOrEqual(3);
      expect(deals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('expectations are well-formed and on the committed seed', () => {
    it('every expectMealNames entry is an exact seed Meal.name (incl. U+2019)', () => {
      for (const c of cases) {
        for (const name of c.expectMealNames ?? []) {
          expect(SEED_MEAL_NAMES.has(name)).toBe(true);
        }
      }
    });

    it('every avoidAllergens entry is in the seed vocabulary (fish/shellfish/soy)', () => {
      for (const c of cases) {
        for (const a of c.avoidAllergens ?? []) {
          expect(SEED_ALLERGENS.has(a)).toBe(true);
        }
        // DTO bound: ≤20 allergens.
        expect((c.avoidAllergens ?? []).length).toBeLessThanOrEqual(20);
      }
    });

    it('preference cases carry expectMealNames; abstain/injection do not', () => {
      for (const c of byIntent('preference')) {
        expect((c.expectMealNames ?? []).length).toBeGreaterThan(0);
      }
      for (const c of [...byIntent('abstain'), ...byIntent('injection')]) {
        expect(c.expectMealNames ?? []).toEqual([]);
        expect(c.expectAbstain).toBe(true);
      }
    });

    it('allergen cases never expect a meal that carries the avoided allergen', () => {
      // The seed's allergen map — used to assert the expectations are coherent
      // (an allergen case must never expect a dish it just filtered out).
      const ALLERGEN_MAP: Record<string, string[]> = {
        'Otoro Selection': ['fish'],
        'Chef’s Omakase': ['fish', 'shellfish'],
        'Toro Truffle Roll': ['fish'],
        'Sashimi Moriawase': ['fish', 'shellfish'],
        'Ikura Don': ['fish', 'soy'],
        'Couple’s Set': ['fish', 'shellfish'],
      };
      for (const c of byIntent('allergen')) {
        const avoided = new Set(c.avoidAllergens ?? []);
        for (const name of c.expectMealNames ?? []) {
          const tags = ALLERGEN_MAP[name] ?? [];
          for (const tag of tags) {
            expect(avoided.has(tag)).toBe(false);
          }
        }
      }
    });
  });
});
