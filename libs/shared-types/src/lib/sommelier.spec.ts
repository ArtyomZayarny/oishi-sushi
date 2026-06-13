import type {
  SommelierAskRequest,
  SommelierAskResponse,
  SommelierConfidence,
  SommelierMealRef,
  SommelierSource,
} from './sommelier.js';

/**
 * T1 — wire contract for the sommelier (spec §6).
 *
 * shared-types is a types-only package; the contract is verified at two layers:
 *  - compile-time: this file fails to typecheck if any §6 member is missing or
 *    mis-shaped. (swc-jest erases types and does NOT typecheck, so jest alone
 *    can pass vacuously — the binding type gate is the api/web build, which
 *    compiles against `@org/shared-types`.)
 *  - runtime: the typed fixtures below are asserted with jest so the field
 *    shape is also exercised under `nx test shared-types`.
 *
 * Import is relative (`./sommelier.js`) not `@org/shared-types`: an in-package
 * spec must use relative paths (@nx/enforce-module-boundaries) — mirrors the
 * sibling shared-types.spec.ts. Cross-package alias resolution is proven by the
 * api + web type gates in T1's verification matrix.
 */

// Compile-time assertion helper: `Expect<Equals<A, B>>` resolves to `true` only
// when A and B are mutually assignable; otherwise it is `false` and the
// `extends true` constraint fails to compile. Used to pin unions exactly.
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

describe('sommelier wire contract (T1 / spec §6)', () => {
  it('SommelierAskRequest: required query, optional avoidAllergens', () => {
    const minimal: SommelierAskRequest = { query: 'something spicy with tuna' };
    const withAllergens: SommelierAskRequest = {
      query: 'recommend a roll',
      avoidAllergens: ['shellfish', 'fish'],
    };

    expect(minimal.query).toBe('something spicy with tuna');
    expect(minimal.avoidAllergens).toBeUndefined();
    expect(withAllergens.avoidAllergens).toEqual(['shellfish', 'fish']);
  });

  it('SommelierConfidence accepts exactly high | low | abstain', () => {
    const high: SommelierConfidence = 'high';
    const low: SommelierConfidence = 'low';
    const abstain: SommelierConfidence = 'abstain';

    // Exact-union pin: `unionIsExact` only typechecks as `true` when the union
    // is exactly 'high' | 'low' | 'abstain' — fails to compile if a member is
    // added, removed, or renamed. Referenced at runtime so it is not unused.
    const unionIsExact: Expect<
      Equals<SommelierConfidence, 'high' | 'low' | 'abstain'>
    > = true;

    expect(unionIsExact).toBe(true);
    expect([high, low, abstain]).toEqual(['high', 'low', 'abstain']);
  });

  it('SommelierMealRef: snapshot fields joined server-side + model why', () => {
    const ref: SommelierMealRef = {
      mealId: 'cm0000000000000000000001',
      name: 'Spicy Tuna Roll',
      priceCents: 1290,
      imageUrl: '/img/str.jpg',
      why: 'Sriracha-marinated tuna — the spiciest tuna item on the menu.',
    };
    const noImage: SommelierMealRef = {
      mealId: 'cm0000000000000000000002',
      name: 'Tuna Tataki',
      priceCents: 1590,
      imageUrl: null,
      why: 'Seared rare tuna with pepper crust — spicy without mayo.',
    };

    expect(ref.priceCents).toBe(1290);
    expect(ref.imageUrl).toBe('/img/str.jpg');
    expect(noImage.imageUrl).toBeNull();
    expect(typeof ref.why).toBe('string');
  });

  it('SommelierSource: menu ref vs kb ref (section only on kb)', () => {
    const menuSource: SommelierSource = {
      type: 'menu',
      ref: 'cm0000000000000000000001',
    };
    const kbSource: SommelierSource = {
      type: 'kb',
      ref: 'pairings',
      section: 'tea',
    };

    expect(menuSource.type).toBe('menu');
    expect(menuSource.section).toBeUndefined();
    expect(kbSource.type).toBe('kb');
    expect(kbSource.section).toBe('tea');
  });

  it('SommelierAskResponse: well-formed high-confidence answer', () => {
    const response: SommelierAskResponse = {
      answer:
        'For a spicy tuna hit, the Spicy Tuna Roll [1] brings heat, and the Tuna Tataki [2] adds a seared edge. Both pair well with green tea [3].',
      recommendations: [
        {
          mealId: 'cm0000000000000000000001',
          name: 'Spicy Tuna Roll',
          priceCents: 1290,
          imageUrl: '/img/str.jpg',
          why: 'Sriracha-marinated tuna — the spiciest tuna item on the menu.',
        },
        {
          mealId: 'cm0000000000000000000002',
          name: 'Tuna Tataki',
          priceCents: 1590,
          imageUrl: null,
          why: 'Seared rare tuna with pepper crust — spicy without mayo.',
        },
      ],
      sources: [
        { type: 'menu', ref: 'cm0000000000000000000001' },
        { type: 'menu', ref: 'cm0000000000000000000002' },
        { type: 'kb', ref: 'pairings', section: 'tea' },
      ],
      confidence: 'high',
      requestId: 'req_01H000000000000000000000',
    };

    expect(response.recommendations).toHaveLength(2);
    expect(response.recommendations.length).toBeLessThanOrEqual(5);
    expect(response.sources).toHaveLength(3);
    expect(response.confidence).toBe('high');
    expect(response.requestId).toMatch(/^req_/);
    // sources non-empty whenever recommendations non-empty (F1-AC4 shape)
    expect(response.sources.length).toBeGreaterThan(0);
  });

  it('SommelierAskResponse: abstain has empty recommendations', () => {
    const abstain: SommelierAskResponse = {
      answer:
        "We don't serve pizza — we're a sushi shop. Want me to suggest something from the menu instead?",
      recommendations: [],
      sources: [],
      confidence: 'abstain',
      requestId: 'req_01H000000000000000000001',
    };

    expect(abstain.confidence).toBe('abstain');
    expect(abstain.recommendations).toHaveLength(0);
  });
});
