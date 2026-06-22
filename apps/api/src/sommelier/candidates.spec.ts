import type { Meal } from '@prisma/client';
import type { CategoryWithMeals } from '../menu/menu.service';
import {
  assembleCandidates,
  filterByAllergens,
  flattenSnapshot,
  markNewest,
  type Candidate,
  type SnapshotMeal,
} from './candidates';

/**
 * T6 — Candidate assembly: hard allergen filter + newest marking (spec §4 steps
 * 2–4, §5 F4/F2/F5, §7.1–7.2). The safety kernel — strictest TDD.
 *
 * These are PURE functions over a request-scoped meal snapshot (no DB at test
 * time — fixtures only). They are the single source of recommendable meals
 * (filter-then-advise): T7 serializes `candidates` into the prompt, and T8
 * re-checks model output against the SAME snapshot + `excludedIds`.
 *
 * `filterByAllergens` carries a release-blocking 100% BRANCH coverage gate
 * (F4-AC1) — enforced per-file in apps/api/jest.config.cts.
 */

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a snapshot meal fixture. `createdAt` is REQUIRED and must be DISTINCT
 * per meal in newest-marking tests: cuid ids are not insertion-ordered, so the
 * `id` tie-break is a last resort only (T6 note in §10).
 */
function meal(
  partial: Partial<SnapshotMeal> & {
    id: string;
    allergens: string[];
    createdAt: Date;
  },
): SnapshotMeal {
  return {
    id: partial.id,
    name: partial.name ?? `Meal ${partial.id}`,
    description: partial.description ?? `Description for ${partial.id}`,
    priceCents: partial.priceCents ?? 1000,
    imageUrl: partial.imageUrl ?? null,
    active: partial.active ?? true,
    deletedAt: partial.deletedAt ?? null,
    categoryId: partial.categoryId ?? 'cat-1',
    allergens: partial.allergens,
    createdAt: partial.createdAt,
    updatedAt: partial.updatedAt ?? partial.createdAt,
    category: partial.category ?? 'Maki',
  };
}

function at(iso: string): Date {
  return new Date(iso);
}

// ---------------------------------------------------------------------------
// flattenSnapshot — explicit flatten step (T6 §10)
// ---------------------------------------------------------------------------

describe('T6 — flattenSnapshot (listPublic CategoryWithMeals[] → SnapshotMeal[])', () => {
  function category(
    name: string,
    sortOrder: number,
    meals: Meal[],
  ): CategoryWithMeals {
    return {
      id: `cat-${name.toLowerCase()}`,
      name,
      slug: name.toLowerCase(),
      sortOrder,
      meals,
    };
  }

  function rawMeal(id: string, categoryId: string): Meal {
    return {
      id,
      name: `Meal ${id}`,
      description: `Desc ${id}`,
      priceCents: 1200,
      imageUrl: null,
      active: true,
      deletedAt: null,
      categoryId,
      allergens: ['fish'],
      createdAt: at('2026-01-01T00:00:00Z'),
      updatedAt: at('2026-01-01T00:00:00Z'),
    };
  }

  it('flattens categories.flatMap(c => c.meals) preserving category order', () => {
    const categories = [
      category('Maki', 1, [
        rawMeal('m1', 'cat-maki'),
        rawMeal('m2', 'cat-maki'),
      ]),
      category('Nigiri', 2, [rawMeal('n1', 'cat-nigiri')]),
    ];

    const snapshot = flattenSnapshot(categories);

    expect(snapshot.map((m) => m.id)).toEqual(['m1', 'm2', 'n1']);
  });

  it('attaches the parent category NAME to each meal as `category`', () => {
    const categories = [
      category('Maki', 1, [rawMeal('m1', 'cat-maki')]),
      category('Nigiri', 2, [rawMeal('n1', 'cat-nigiri')]),
    ];

    const snapshot = flattenSnapshot(categories);

    expect(snapshot.find((m) => m.id === 'm1')?.category).toBe('Maki');
    expect(snapshot.find((m) => m.id === 'n1')?.category).toBe('Nigiri');
  });

  it('carries price/name/allergens straight from the DB rows (F5 — never fabricated)', () => {
    const categories = [category('Maki', 1, [rawMeal('m1', 'cat-maki')])];

    const [m1] = flattenSnapshot(categories);

    expect(m1.name).toBe('Meal m1');
    expect(m1.priceCents).toBe(1200);
    expect(m1.allergens).toEqual(['fish']);
  });

  it('yields an empty snapshot for empty categories / categories with no meals', () => {
    expect(flattenSnapshot([])).toEqual([]);
    expect(flattenSnapshot([category('Maki', 1, [])])).toEqual([]);
  });

  // Boundary test substituting for the dropped `meal.allergens ?? []` defensive
  // guard in filterByAllergens: prove the real boundary always yields an array
  // so the filter can rely on `meal.allergens` being non-null (see filter note).
  it('every flattened meal has an array `allergens` (boundary contract the filter relies on)', () => {
    const categories = [
      category('Maki', 1, [
        rawMeal('m1', 'cat-maki'),
        rawMeal('m2', 'cat-maki'),
      ]),
    ];

    for (const m of flattenSnapshot(categories)) {
      expect(Array.isArray(m.allergens)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// filterByAllergens — F4-AC1, 100% BRANCH COVERAGE REQUIRED
// ---------------------------------------------------------------------------

describe('T6 / F4-AC1 — filterByAllergens (hard allergen gate, 100% branch coverage)', () => {
  // --- The pinned normalization case from the spec (§5 F4-AC1) -------------
  it('PIN: meal allergens ["Fish"] + avoidAllergens ["fish "] ⇒ excluded (trim+lowercase)', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['Fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['fish ']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['a']);
  });

  // --- B1: avoidAllergens ?? [] — nullish vs non-nullish ------------------
  it('B1 nullish arm: avoidAllergens undefined ⇒ all meals survive, no exclusions', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['shellfish'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, undefined);

    expect(survivors.map((m) => m.id)).toEqual(['a', 'b']);
    expect(excludedIds).toEqual([]);
  });

  // --- B2: if (avoid.size === 0) — true arm via [] -----------------------
  it('B2 true arm: empty avoidAllergens array ⇒ all survive (no filtering)', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, []);

    expect(survivors.map((m) => m.id)).toEqual(['a']);
    expect(excludedIds).toEqual([]);
  });

  // --- B4: .some() — empty meal allergens (predicate never true) ----------
  it('B4 no-allergen meal: meal with allergens:[] is never excluded', () => {
    const meals = [
      meal({ id: 'a', allergens: [], createdAt: at('2026-01-01T00:00:00Z') }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['fish']);

    expect(survivors.map((m) => m.id)).toEqual(['a']);
    expect(excludedIds).toEqual([]);
  });

  // --- B4/B5: hit on the FIRST element (short-circuit) -> excluded --------
  it('B4/B5 hit arm (first element matches): excluded, id recorded', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish', 'soy'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['fish']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['a']);
  });

  // --- B4: hit only on a LATER element (predicate false then true) --------
  it('B4 later-element match: only the second allergen matches ⇒ still excluded', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['soy', 'shellfish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['shellfish']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['a']);
  });

  // --- B5 false arm: no overlap ⇒ survives ---------------------------------
  it('B5 survive arm: meal allergens disjoint from avoid ⇒ survives', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['soy'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['fish']);

    expect(survivors.map((m) => m.id)).toEqual(['a']);
    expect(excludedIds).toEqual([]);
  });

  // --- Mixed partition over many meals + multiple avoid values -------------
  it('partitions a mixed menu: survivors vs excludedIds (multiple avoid values, partial overlap)', () => {
    const meals = [
      meal({
        id: 'safe',
        allergens: ['soy'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'fishy',
        allergens: ['fish'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
      meal({
        id: 'shelly',
        allergens: ['shellfish'],
        createdAt: at('2026-01-03T00:00:00Z'),
      }),
      meal({
        id: 'plain',
        allergens: [],
        createdAt: at('2026-01-04T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, [
      'fish',
      'shellfish',
    ]);

    expect(survivors.map((m) => m.id)).toEqual(['safe', 'plain']);
    expect(excludedIds).toEqual(['fishy', 'shelly']);
  });

  // --- Normalization edges --------------------------------------------------
  it('normalizes leading, trailing, and both-sided whitespace on both meal and avoid values', () => {
    const meals = [
      meal({
        id: 'lead',
        allergens: [' fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'trail',
        allergens: ['fish '],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
      meal({
        id: 'both',
        allergens: ['  fish  '],
        createdAt: at('2026-01-03T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, [' FISH ']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['lead', 'trail', 'both']);
  });

  it('normalizes case (uppercase / mixed) to exact match', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['SHELLFISH'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['ShellFish'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { excludedIds } = filterByAllergens(meals, ['shellfish']);

    expect(excludedIds).toEqual(['a', 'b']);
  });

  // Internal-whitespace collapse (multi-word vocab e.g. "tree nuts"): a health
  // gate must not let "tree  nuts" (double space) slip past "tree nuts".
  it('collapses INTERNAL whitespace so multi-word allergens cannot slip the gate', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['tree  nuts'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['tree\tnuts'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['tree nuts']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['a', 'b']);
  });

  it('dedupes avoid values AFTER normalization (["fish","Fish","fish "] behaves as one)', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['soy'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, [
      'fish',
      'Fish',
      'fish ',
    ]);

    expect(survivors.map((m) => m.id)).toEqual(['b']);
    expect(excludedIds).toEqual(['a']);
  });

  it('empty-string avoid value excludes nothing and does NOT short-circuit to "no filter"', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['soy'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    // [''] normalizes to a size-1 Set {''} → B2 false (filtering DOES run),
    // but no real meal carries an '' allergen, so nothing is excluded.
    const { survivors, excludedIds } = filterByAllergens(meals, ['']);

    expect(survivors.map((m) => m.id)).toEqual(['a', 'b']);
    expect(excludedIds).toEqual([]);
  });

  it('whitespace-only avoid value ["   "] excludes nothing (normalizes to empty, not "no filter")', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['   ']);

    expect(survivors.map((m) => m.id)).toEqual(['a']);
    expect(excludedIds).toEqual([]);
  });

  // --- Boundaries -----------------------------------------------------------
  it('all meals excluded ⇒ survivors empty, excludedIds = every id', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['fish'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { survivors, excludedIds } = filterByAllergens(meals, ['fish']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual(['a', 'b']);
  });

  it('empty meals input + non-empty avoid ⇒ both empty (zero-iteration loop, B2 false path)', () => {
    const { survivors, excludedIds } = filterByAllergens([], ['fish']);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual([]);
  });

  it('empty meals input + undefined avoid ⇒ both empty (B2 true path)', () => {
    const { survivors, excludedIds } = filterByAllergens([], undefined);

    expect(survivors).toEqual([]);
    expect(excludedIds).toEqual([]);
  });

  // --- Contract guarantees the post-validator (T8/F4-AC2) relies on --------
  it('excludedIds are meal IDS, not names or indices (T8 fail-closed re-check keys on id)', () => {
    const meals = [
      meal({
        id: 'cm-real-id',
        name: 'Spicy Tuna Roll',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const { excludedIds } = filterByAllergens(meals, ['fish']);

    expect(excludedIds).toEqual(['cm-real-id']);
    expect(excludedIds).not.toContain('Spicy Tuna Roll');
  });

  it('does NOT mutate the input meals array (purity)', () => {
    const meals = [
      meal({
        id: 'a',
        allergens: ['fish'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'b',
        allergens: ['soy'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];
    const snapshotIds = meals.map((m) => m.id);

    filterByAllergens(meals, ['fish']);

    expect(meals.map((m) => m.id)).toEqual(snapshotIds);
    expect(meals.length).toBe(2);
  });

  it('preserves input order in survivors (defined order for downstream newest-marking)', () => {
    const meals = [
      meal({
        id: 'z',
        allergens: ['soy'],
        createdAt: at('2026-01-03T00:00:00Z'),
      }),
      meal({
        id: 'a',
        allergens: ['soy'],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({
        id: 'm',
        allergens: ['soy'],
        createdAt: at('2026-01-02T00:00:00Z'),
      }),
    ];

    const { survivors } = filterByAllergens(meals, ['fish']);

    expect(survivors.map((m) => m.id)).toEqual(['z', 'a', 'm']);
  });

  it('always returns both keys as arrays on every path (incl. no-avoid early return)', () => {
    const r1 = filterByAllergens([], undefined);
    const r2 = filterByAllergens(
      [
        meal({
          id: 'a',
          allergens: ['fish'],
          createdAt: at('2026-01-01T00:00:00Z'),
        }),
      ],
      ['fish'],
    );

    expect(Array.isArray(r1.survivors)).toBe(true);
    expect(Array.isArray(r1.excludedIds)).toBe(true);
    expect(Array.isArray(r2.survivors)).toBe(true);
    expect(Array.isArray(r2.excludedIds)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// markNewest — F2-AC1 (exactly top-5 by createdAt desc, tie-break id asc)
// ---------------------------------------------------------------------------

describe('T6 / F2-AC1 — markNewest (exactly top-5 newest survivors flagged isNewest)', () => {
  it('flags exactly the top-5 by createdAt descending when there are >5 survivors', () => {
    // 7 survivors, distinct createdAt; newest five are d7..d3.
    const survivors = [
      meal({ id: 'd1', allergens: [], createdAt: at('2026-01-01T00:00:00Z') }),
      meal({ id: 'd2', allergens: [], createdAt: at('2026-01-02T00:00:00Z') }),
      meal({ id: 'd3', allergens: [], createdAt: at('2026-01-03T00:00:00Z') }),
      meal({ id: 'd4', allergens: [], createdAt: at('2026-01-04T00:00:00Z') }),
      meal({ id: 'd5', allergens: [], createdAt: at('2026-01-05T00:00:00Z') }),
      meal({ id: 'd6', allergens: [], createdAt: at('2026-01-06T00:00:00Z') }),
      meal({ id: 'd7', allergens: [], createdAt: at('2026-01-07T00:00:00Z') }),
    ];

    const marked = markNewest(survivors);
    const newestIds = marked
      .filter((m) => m.isNewest)
      .map((m) => m.id)
      .sort();

    expect(newestIds).toEqual(['d3', 'd4', 'd5', 'd6', 'd7']);
    expect(marked.filter((m) => m.isNewest)).toHaveLength(5);
    expect(marked.find((m) => m.id === 'd2')?.isNewest).toBe(false);
    expect(marked.find((m) => m.id === 'd1')?.isNewest).toBe(false);
  });

  it('flags ALL survivors when there are fewer than 5', () => {
    const survivors = [
      meal({ id: 'a', allergens: [], createdAt: at('2026-01-01T00:00:00Z') }),
      meal({ id: 'b', allergens: [], createdAt: at('2026-01-02T00:00:00Z') }),
      meal({ id: 'c', allergens: [], createdAt: at('2026-01-03T00:00:00Z') }),
    ];

    const marked = markNewest(survivors);

    expect(marked.every((m) => m.isNewest)).toBe(true);
    expect(marked.filter((m) => m.isNewest)).toHaveLength(3);
  });

  it('flags exactly 5 when there are exactly 5 survivors', () => {
    const survivors = [1, 2, 3, 4, 5].map((n) =>
      meal({
        id: `d${n}`,
        allergens: [],
        createdAt: at(`2026-01-0${n}T00:00:00Z`),
      }),
    );

    const marked = markNewest(survivors);

    expect(marked.filter((m) => m.isNewest)).toHaveLength(5);
    expect(marked.every((m) => m.isNewest)).toBe(true);
  });

  it('breaks createdAt ties by id ascending (id tie-break is last resort)', () => {
    // 6 survivors; two pairs share a timestamp. Newest distinct ts wins first;
    // within the boundary tie, lower id is "newer" for inclusion.
    const ts = '2026-01-05T00:00:00Z';
    const survivors = [
      meal({
        id: 'older',
        allergens: [],
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
      meal({ id: 'b-tie', allergens: [], createdAt: at(ts) }),
      meal({ id: 'a-tie', allergens: [], createdAt: at(ts) }),
      meal({ id: 'c-tie', allergens: [], createdAt: at(ts) }),
      meal({ id: 'd-tie', allergens: [], createdAt: at(ts) }),
      meal({ id: 'e-tie', allergens: [], createdAt: at(ts) }),
    ];

    const marked = markNewest(survivors);
    const newestIds = marked
      .filter((m) => m.isNewest)
      .map((m) => m.id)
      .sort();

    // 5 of the 5 tied entries are newest (all share the max ts); 'older' is out.
    expect(newestIds).toEqual(['a-tie', 'b-tie', 'c-tie', 'd-tie', 'e-tie']);
    expect(marked.find((m) => m.id === 'older')?.isNewest).toBe(false);
  });

  it('uses id ascending to pick WHICH tied meals make the top-5 cut at the boundary', () => {
    // 5 distinct-newer + 2 sharing the 6th-place timestamp → only one of the two
    // can be in top-5; the lower id wins, the higher id is excluded.
    const survivors = [
      meal({ id: 'n1', allergens: [], createdAt: at('2026-01-10T00:00:00Z') }),
      meal({ id: 'n2', allergens: [], createdAt: at('2026-01-09T00:00:00Z') }),
      meal({ id: 'n3', allergens: [], createdAt: at('2026-01-08T00:00:00Z') }),
      meal({ id: 'n4', allergens: [], createdAt: at('2026-01-07T00:00:00Z') }),
      // boundary tie at the 5th/6th slot:
      meal({
        id: 'tie-b',
        allergens: [],
        createdAt: at('2026-01-06T00:00:00Z'),
      }),
      meal({
        id: 'tie-a',
        allergens: [],
        createdAt: at('2026-01-06T00:00:00Z'),
      }),
    ];

    const marked = markNewest(survivors);
    const newest = marked
      .filter((m) => m.isNewest)
      .map((m) => m.id)
      .sort();

    expect(newest).toEqual(['n1', 'n2', 'n3', 'n4', 'tie-a']);
    expect(marked.find((m) => m.id === 'tie-b')?.isNewest).toBe(false);
  });

  it('returns Candidate shape: {id,name,description,priceCents,allergens,category,isNewest}', () => {
    const survivors = [
      meal({
        id: 'a',
        name: 'Spicy Tuna Roll',
        description: 'Hot',
        priceCents: 1290,
        allergens: ['fish'],
        category: 'Maki',
        createdAt: at('2026-01-01T00:00:00Z'),
      }),
    ];

    const [c] = markNewest(survivors);

    expect(c).toEqual({
      id: 'a',
      name: 'Spicy Tuna Roll',
      description: 'Hot',
      priceCents: 1290,
      allergens: ['fish'],
      category: 'Maki',
      isNewest: true,
    });
  });

  it('handles an empty survivor list (no newest, no throw)', () => {
    expect(markNewest([])).toEqual([]);
  });

  it('does not mutate the input survivors array (purity)', () => {
    const survivors = [
      meal({ id: 'a', allergens: [], createdAt: at('2026-01-02T00:00:00Z') }),
      meal({ id: 'b', allergens: [], createdAt: at('2026-01-01T00:00:00Z') }),
    ];
    const order = survivors.map((m) => m.id);

    markNewest(survivors);

    expect(survivors.map((m) => m.id)).toEqual(order);
  });
});

// ---------------------------------------------------------------------------
// assembleCandidates — end-to-end orchestration over one snapshot (F5)
// ---------------------------------------------------------------------------

describe('T6 / F5 — assembleCandidates (one snapshot: filter → mark, + excludedIds)', () => {
  function category(
    name: string,
    sortOrder: number,
    meals: Meal[],
  ): CategoryWithMeals {
    return {
      id: `cat-${name}`,
      name,
      slug: name.toLowerCase(),
      sortOrder,
      meals,
    };
  }

  function rawMeal(
    id: string,
    categoryId: string,
    allergens: string[],
    createdAt: string,
    name = `Meal ${id}`,
    priceCents = 1500,
  ): Meal {
    return {
      id,
      name,
      description: `Desc ${id}`,
      priceCents,
      imageUrl: null,
      active: true,
      deletedAt: null,
      categoryId,
      allergens,
      createdAt: at(createdAt),
      updatedAt: at(createdAt),
    };
  }

  it('produces correct candidates + excludedIds end-to-end over a fixture menu', () => {
    const categories = [
      category('Maki', 1, [
        rawMeal('safe1', 'cat-Maki', ['soy'], '2026-01-05T00:00:00Z'),
        rawMeal('fishy', 'cat-Maki', ['fish'], '2026-01-04T00:00:00Z'),
      ]),
      category('Nigiri', 2, [
        rawMeal('safe2', 'cat-Nigiri', [], '2026-01-06T00:00:00Z'),
        rawMeal('shelly', 'cat-Nigiri', ['shellfish'], '2026-01-03T00:00:00Z'),
      ]),
    ];

    const { candidates, excludedIds } = assembleCandidates(categories, [
      'fish',
      'shellfish',
    ]);

    expect(candidates.map((c) => c.id).sort()).toEqual(['safe1', 'safe2']);
    expect(excludedIds.sort()).toEqual(['fishy', 'shelly']);
    // survivors (only 2) are all flagged newest.
    expect(candidates.every((c) => c.isNewest)).toBe(true);
  });

  it('candidate fields come from the snapshot (name/price/category), not fabricated', () => {
    const categories = [
      category('Maki', 1, [
        rawMeal(
          'a',
          'cat-Maki',
          ['soy'],
          '2026-01-05T00:00:00Z',
          'Salmon Avocado Roll',
          980,
        ),
      ]),
    ];

    const { candidates } = assembleCandidates(categories, []);

    expect(candidates[0]).toMatchObject({
      id: 'a',
      name: 'Salmon Avocado Roll',
      priceCents: 980,
      category: 'Maki',
    });
  });

  it('marks exactly top-5 newest among the SURVIVORS (filter happens before marking)', () => {
    // 7 safe meals + 1 excluded; newest-5 must be drawn from the 7 survivors,
    // never the excluded one even if it is the newest overall.
    const safe = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      rawMeal(`s${n}`, 'cat-Maki', ['soy'], `2026-01-0${n}T00:00:00Z`),
    );
    const excludedNewest = rawMeal(
      'x',
      'cat-Maki',
      ['fish'],
      '2026-01-09T00:00:00Z',
    );
    const categories = [category('Maki', 1, [...safe, excludedNewest])];

    const { candidates, excludedIds } = assembleCandidates(categories, [
      'fish',
    ]);

    expect(excludedIds).toEqual(['x']);
    const newest = candidates
      .filter((c) => c.isNewest)
      .map((c) => c.id)
      .sort();
    expect(newest).toEqual(['s3', 's4', 's5', 's6', 's7']);
    expect(candidates.find((c) => c.id === 'x')).toBeUndefined();
  });

  it('F5 snapshot rule: operates on the passed snapshot only — no second fetch path', () => {
    // The function signature takes the snapshot as its argument; there is no DB
    // dependency to inject. Empty snapshot ⇒ empty result, proving it reads only
    // what it is given.
    const { candidates, excludedIds } = assembleCandidates([], ['fish']);

    expect(candidates).toEqual([]);
    expect(excludedIds).toEqual([]);
  });

  it('all candidates carry isNewest as a boolean (never undefined)', () => {
    const categories = [
      category('Maki', 1, [
        rawMeal('a', 'cat-Maki', ['soy'], '2026-01-01T00:00:00Z'),
        rawMeal('b', 'cat-Maki', ['soy'], '2026-01-02T00:00:00Z'),
      ]),
    ];

    const { candidates } = assembleCandidates(categories, []);

    for (const c of candidates) {
      expect(typeof c.isNewest).toBe('boolean');
    }
  });
});

// Type-level pin: Candidate must expose exactly the §4-step-6 prompt shape.
describe('T6 — Candidate type shape (compile-time pin)', () => {
  it('Candidate carries the prompt fields T7 serializes', () => {
    const c: Candidate = {
      id: 'a',
      name: 'Spicy Tuna Roll',
      description: 'Hot',
      priceCents: 1290,
      allergens: ['fish'],
      category: 'Maki',
      isNewest: true,
    };

    expect(c.id).toBe('a');
  });
});
